import Foundation

@main struct FolderTargetTests {
    static func link(_ path: String) -> URL {
        var u = URLComponents(); u.scheme = FolderTarget.scheme; u.host = "open"
        u.queryItems = [URLQueryItem(name: "path", value: path)]
        return u.url!
    }
    static func rejects(_ operation: () throws -> Void) {
        do { try operation(); fatalError("Deveria rejeitar") } catch { }
    }
    static func main() throws {
        let path = "_. Database 2026/01. Clientes - Projetos/10. Outubro/SLC Máquinas/[0369]_CHAMADA_TRATOR_3036"
        assert(tryValue(link(path)) == path)
        let historical = "_. Database 2026/01. Clientes - Projetos/10. Outubro/Sicredi Região da Produção/[0363] Certificação + GPTW 100% #1"
        assert(tryValue(link(historical)) == historical)
        for invalid in ["", "/" + path, path + "/01. Takes", path.replacingOccurrences(of: "SLC Máquinas", with: ".."),
                        path.replacingOccurrences(of: "SLC Máquinas", with: "."), path + "\n", path + "\\x",
                        path.replacingOccurrences(of: "10. Outubro", with: "99. Outro"),
                        path.replacingOccurrences(of: "[0369]", with: "Script.app")] {
            rejects { _ = try FolderTarget.relativePath(from: link(invalid)) }
        }
        for invalid in ["https://open?path=x", "adverse-finder://other?path=x", "adverse-finder://user@open?path=x",
                        "adverse-finder://open:123?path=x", "adverse-finder://open/a?path=x",
                        link(path).absoluteString + "&path=other", link(path).absoluteString + "#fragment",
                        "adverse-finder://open?command=whoami", "adverse-finder://open?path=%2Fetc%2Fpasswd"] {
            rejects { _ = try FolderTarget.relativePath(from: URL(string: invalid)!) }
        }
        assert(FolderTarget.isRootShare(source: "//user@192.168.18.200/PROJETOS_ATIVOS", filesystem: "smbfs"))
        assert(!FolderTarget.isRootShare(source: "//user@192.168.18.200/PROJETOS_ATIVOS/project", filesystem: "smbfs"))
        assert(!FolderTarget.isRootShare(source: "//user@other/PROJETOS_ATIVOS", filesystem: "smbfs"))
        assert(!FolderTarget.isRootShare(source: "//user@192.168.18.200/BRUTOS", filesystem: "smbfs"))
        assert(!FolderTarget.isRootShare(source: "//user@192.168.18.200/PROJETOS_ATIVOS", filesystem: "apfs"))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let dest = root.appendingPathComponent(path, isDirectory: true)
        try FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true)
        let resolved = try FolderTarget.resolve(relativePath: path, root: root)
        assert(resolved.path == dest.resolvingSymlinksInPath().path)
        try FileManager.default.removeItem(at: dest)
        rejects { _ = try FolderTarget.resolve(relativePath: path, root: root) }
        FileManager.default.createFile(atPath: dest.path, contents: Data())
        rejects { _ = try FolderTarget.resolve(relativePath: path, root: root) }
        try FileManager.default.removeItem(at: dest)
        try FileManager.default.createSymbolicLink(at: dest, withDestinationURL: root)
        rejects { _ = try FolderTarget.resolve(relativePath: path, root: root) }
        print("OK: nomes, caracteres especiais, URL, montagem, pasta ausente, arquivo e atalhos")
    }
    static func tryValue(_ url: URL) -> String { try! FolderTarget.relativePath(from: url) }
}
