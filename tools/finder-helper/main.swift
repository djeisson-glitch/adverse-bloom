import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var receivedLink = false
    private var busy = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        // URL events can arrive immediately after launch. Ordinary launch shows setup confirmation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [self] in
            if !receivedLink {
                show("Adverse Finder pronto", "No Adverse OS, clique em Pastas criadas. O auxiliar abre a pasta dentro de PROJETOS_ATIVOS, sem montar o projeto separadamente.")
                NSApp.terminate(nil)
            }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        receivedLink = true
        guard !busy else { return }
        busy = true
        guard urls.count == 1, let url = urls.first else { fail(FolderError.invalidLink); return }
        let path: String
        do { path = try FolderTarget.relativePath(from: url) }
        catch { fail(error); return }
        openProject(path)
    }

    private func openProject(_ path: String) {
        do {
            let root = try FolderTarget.mountedRoot()
            let folder = try FolderTarget.resolve(relativePath: path, root: root)
            guard let finder = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.finder") else {
                fail(FolderError.unsafeFolder); return
            }
            NSWorkspace.shared.open([folder], withApplicationAt: finder,
                                    configuration: NSWorkspace.OpenConfiguration()) { _, error in
                DispatchQueue.main.async {
                    if let error = error { self.fail(error) }
                    else { NSApp.terminate(nil) }
                }
            }
        } catch FolderError.disconnected {
            // No deep SMB links: connect only the root share, then the user can click again.
            let alert = NSAlert()
            alert.messageText = "Conecte PROJETOS_ATIVOS"
            alert.informativeText = "O servidor não está conectado neste Mac. Conecte-o no Finder e depois clique novamente em Pastas criadas. É necessário estar na rede da ADVERSE."
            alert.addButton(withTitle: "Conectar servidor")
            alert.addButton(withTitle: "Cancelar")
            NSApp.activate(ignoringOtherApps: true)
            if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(FolderTarget.serverURL) }
            NSApp.terminate(nil)
        } catch { fail(error) }
    }

    private func show(_ title: String, _ message: String) {
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = message
        alert.addButton(withTitle: "OK")
        NSApp.activate(ignoringOtherApps: true); alert.runModal()
    }
    private func fail(_ error: Error) {
        show("Não foi possível abrir a pasta", error.localizedDescription)
        NSApp.terminate(nil)
    }
}

// Read-only diagnostics for support. Does not launch Finder, connect or write files.
if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--check" {
    do {
        guard let url = URL(string: CommandLine.arguments[2]) else { throw FolderError.invalidLink }
        let path = try FolderTarget.relativePath(from: url)
        let folder = try FolderTarget.resolve(relativePath: path, root: FolderTarget.mountedRoot())
        print(folder.path); exit(0)
    } catch { fputs(error.localizedDescription + "\n", stderr); exit(1) }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
