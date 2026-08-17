package de.dockdo.app

/**
 * Parst eine Server-Adresse. Erlaubt sind:
 *  - eine Domain (https wird ergänzt), z. B. "meine-domain.de"
 *  - eine IP mit Port 3000, z. B. "192.168.1.5:3000" (http wird ergänzt)
 * Jeder andere Port (insbesondere :3001) ist ungültig -> null.
 */
fun parseServerUrl(raw: String): String? {
    var u = raw.trim()
    if (u.isEmpty()) return null
    var scheme = ""
    if (u.startsWith("http://")) {
        scheme = "http://"
        u = u.removePrefix("http://")
    } else if (u.startsWith("https://")) {
        scheme = "https://"
        u = u.removePrefix("https://")
    }
    u = u.trimEnd('/')
    if (u.isEmpty()) return null

    val parts = u.split(":")
    val host = parts[0]
    if (host.isEmpty()) return null
    if (parts.size > 2) return null

    var port: Int? = null
    if (parts.size == 2) {
        port = parts[1].toIntOrNull() ?: return null
        if (port != 3000) return null
    }

    if (host.contains(" ") || host.contains("/") || host.contains("@")) return null

    val finalScheme = when {
        scheme.isNotEmpty() -> scheme
        port != null -> "http://"
        else -> "https://"
    }
    return if (port != null) "$finalScheme$host:$port" else "$finalScheme$host"
}