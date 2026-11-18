package com.coop.android.core.auth

/**
 * Exact Kotlin port of backend/team.py WRITE_MATRIX so the Android client
 * hides/disables controls a role cannot mutate while the server stays authoritative.
 */
object WriteMatrix {
    val teamRoles = listOf("manager", "sales", "inventory", "accountant", "viewer")

    val roleLabels = mapOf(
        "owner" to "Business Owner",
        "manager" to "Manager",
        "sales" to "Sales Staff",
        "inventory" to "Inventory Staff",
        "accountant" to "Accountant",
        "viewer" to "Read-only Viewer",
    )

    private val writeMatrix: Map<String, Set<String>> = mapOf(
        "/customers" to setOf("owner", "manager", "sales"),
        "/orders" to setOf("owner", "manager", "sales"),
        "/products" to setOf("owner", "manager", "inventory"),
        "/inventory" to setOf("owner", "manager", "inventory"),
        "/imports" to setOf("owner", "manager", "sales", "inventory"),
        "/invoices" to setOf("owner", "manager", "sales", "accountant"),
        "/sync" to setOf("owner", "manager"),
    )

    private val ownerOnlyPrefixes = listOf(
        "/billing",
        "/team",
        "/audit",
        "/backups",
        "/business/settings",
    )

    fun canWrite(role: String?, path: String): Boolean {
        val cleanRole = role?.trim()?.lowercase() ?: return false
        if (cleanRole == "owner") return true
        if (cleanRole == "manager") {
            return ownerOnlyPrefixes.none { path.startsWith(it) }
        }
        val firstSegment = "/" + path.trimStart('/').substringBefore('/')
        val allowed = writeMatrix[firstSegment] ?: return false
        return cleanRole in allowed
    }

    fun isOwner(role: String?): Boolean = role?.equals("owner", ignoreCase = true) == true
    fun isManagerOrOwner(role: String?): Boolean =
        role?.lowercase() in setOf("owner", "manager")
}
