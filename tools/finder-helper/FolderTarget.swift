import Foundation
import Darwin

enum FolderError: LocalizedError {
    case invalidLink, disconnected, ambiguousMount, missingFolder, unsafeFolder
    var errorDescription: String? {
        switch self {
        case .invalidLink: return "Este link de pasta não é válido. Abra o projeto no Adverse OS e tente novamente."
        case .disconnected: return "Conecte PROJETOS_ATIVOS no Finder e tente novamente."
        case .ambiguousMount: return "Há mais de uma conexão com PROJETOS_ATIVOS. Mantenha apenas a conexão que você utiliza no Finder e tente novamente."
        case .missingFolder: return "A pasta registrada no Adverse OS não foi encontrada no servidor. Confira se ela foi renomeada ou movida."
        case .unsafeFolder: return "O caminho contém um atalho ou não é uma pasta válida de projeto."
        }
    }
}

struct FolderTarget {
    static let scheme = "adverse-finder"
    static let server = "192.168.18.200"
    static let share = "PROJETOS_ATIVOS"
    static let serverURL = URL(string: "smb://192.168.18.200/PROJETOS_ATIVOS")!

    static func relativePath(from url: URL) throws -> String {
        guard let u = URLComponents(url: url, resolvingAgainstBaseURL: false),
              u.scheme == scheme, u.host == "open", u.user == nil, u.password == nil,
              u.port == nil, u.fragment == nil, u.path.isEmpty,
              let items = u.queryItems, items.count == 1, items[0].name == "path",
              let path = items[0].value, path.utf8.count <= 2048 else { throw FolderError.invalidLink }
        let parts = path.components(separatedBy: "/")
        guard parts.count == 5,
              parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("\\") &&
                  $0.rangeOfCharacter(from: .controlCharacters) == nil }),
              parts[0].range(of: #"^_\. Database 20[0-9]{2}$"#, options: .regularExpression) != nil,
              parts[1] == "01. Clientes - Projetos",
              parts[2].range(of: #"^(0[1-9]|1[0-2])\. [^/]+$"#, options: .regularExpression) != nil,
              parts[4].range(of: #"^\[[0-9]{4,8}\]([ _].+)?$"#, options: .regularExpression) != nil
        else { throw FolderError.invalidLink }
        return path
    }

    static func isRootShare(source: String, filesystem: String) -> Bool {
        guard filesystem == "smbfs", source.hasPrefix("//"),
              let u = URLComponents(string: "smb:" + source),
              u.host?.lowercased() == server, u.port == nil,
              u.path == "/" + share else { return false }
        return true
    }

    static func mountedRoot() throws -> URL {
        var mounts: UnsafeMutablePointer<statfs>?
        let count = getmntinfo(&mounts, MNT_NOWAIT)
        guard count > 0, let mounts = mounts else { throw FolderError.disconnected }
        var roots = Set<URL>()
        for i in 0..<Int(count) {
            var m = mounts[i]
            let source = withUnsafePointer(to: &m.f_mntfromname) { p in
                p.withMemoryRebound(to: CChar.self, capacity: Int(MNAMELEN)) { String(cString: $0) }
            }
            let filesystem = withUnsafePointer(to: &m.f_fstypename) { p in
                p.withMemoryRebound(to: CChar.self, capacity: 16) { String(cString: $0) }
            }
            if isRootShare(source: source, filesystem: filesystem) {
                let path = withUnsafePointer(to: &m.f_mntonname) { p in
                    p.withMemoryRebound(to: CChar.self, capacity: Int(MNAMELEN)) { String(cString: $0) }
                }
                roots.insert(URL(fileURLWithPath: path, isDirectory: true))
            }
        }
        guard !roots.isEmpty else { throw FolderError.disconnected }
        guard roots.count == 1, let root = roots.first else { throw FolderError.ambiguousMount }
        return root
    }

    // Called only with a mount discovered above; no mount point comes from a URL.
    static func resolve(relativePath: String, root: URL) throws -> URL {
        // Validate again so callers cannot bypass the URL boundary.
        var link = URLComponents(); link.scheme = scheme; link.host = "open"
        link.queryItems = [URLQueryItem(name: "path", value: relativePath)]
        guard let url = link.url else { throw FolderError.invalidLink }
        _ = try self.relativePath(from: url)
        let base = root.standardizedFileURL.resolvingSymlinksInPath()
        var folder = base
        for part in relativePath.components(separatedBy: "/") {
            folder.appendPathComponent(part, isDirectory: true)
            let attrs: [FileAttributeKey: Any]
            do { attrs = try FileManager.default.attributesOfItem(atPath: folder.path) }
            catch { throw FolderError.missingFolder }
            guard attrs[.type] as? FileAttributeType == .typeDirectory else { throw FolderError.unsafeFolder }
            let resolved = folder.resolvingSymlinksInPath().standardizedFileURL
            guard resolved.path.hasPrefix(base.path + "/") else { throw FolderError.unsafeFolder }
        }
        return folder
    }
}
