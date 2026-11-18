package com.coop.android.ui.navigation

object CoopRoutes {
    const val SIGN_IN = "sign_in"
    const val WELCOME = "welcome"
    const val INVITE = "invite"

    // 5 Bottom Navigation Tabs
    const val HOME = "home"
    const val OPS = "ops"
    const val COOP_AI = "coop_ai"
    const val CLIENTS = "clients"
    const val MORE = "more"

    // Detail & Sub-screens
    const val BRIEFING = "briefing"
    const val CREATE_ORDER = "orders/new"
    const val ORDER_DETAIL = "orders/{orderId}"
    const val CUSTOMER_DETAIL = "customers/{customerId}"
    const val INVOICES = "invoices"
    const val RECEIVABLES = "receivables"
    const val IMPORT = "import"
    const val REPORTS = "reports"
    const val SYNC_CENTER = "sync"
    const val BILLING = "billing"
    const val TEAM = "team"
    const val SETTINGS = "settings"
    const val SUPPORT = "support"
    const val PLATFORM_ADMIN = "admin"

    fun createOrder(
        customerId: Int? = null,
        productId: Int? = null,
        quantity: Int? = null,
    ): String {
        val params = buildList {
            if (customerId != null) add("customerId=$customerId")
            if (productId != null) add("productId=$productId")
            if (quantity != null) add("quantity=$quantity")
        }
        return if (params.isEmpty()) CREATE_ORDER else "$CREATE_ORDER?${params.joinToString("&")}"
    }

    fun orderDetail(orderId: Int) = "orders/$orderId"
    fun customerDetail(customerId: Int) = "customers/$customerId"
}
