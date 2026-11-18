package com.coop.android.ui.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.coop.android.core.network.dto.DailySummaryDto
import com.coop.android.core.sync.SyncStatusState
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.CustomerRepository
import com.coop.android.data.repository.FeedbackSupportPlatformRepository
import com.coop.android.data.repository.OrderRepository
import com.coop.android.data.repository.ProductRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.navigation.CoopRoutes
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.tint
import kotlinx.coroutines.launch

data class BottomNavItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val isAi: Boolean = false,
)

val CoopBottomTabs = listOf(
    BottomNavItem(CoopRoutes.HOME, "Home", Icons.Rounded.Dashboard),
    BottomNavItem(CoopRoutes.OPS, "Ops", Icons.Rounded.Inventory2),
    BottomNavItem(CoopRoutes.COOP_AI, "Co-op AI", Icons.Rounded.AutoAwesome, isAi = true),
    BottomNavItem(CoopRoutes.CLIENTS, "Clients", Icons.Rounded.Group),
    BottomNavItem(CoopRoutes.MORE, "More", Icons.Rounded.Menu),
)

@Composable
fun CoopAppScaffold(
    currentRoute: String?,
    businessName: String,
    syncStatus: SyncStatusState,
    notifDailySummary: Boolean = true,
    notifLowStock: Boolean = true,
    feedbackRepo: FeedbackSupportPlatformRepository,
    productRepo: ProductRepository,
    customerRepo: CustomerRepository,
    orderRepo: OrderRepository,
    onNavigateTab: (String) -> Unit,
    onNavigateRoute: (String) -> Unit,
    onOpenOrder: (Int) -> Unit,
    onOpenCustomer: (Int) -> Unit,
    onOpenSyncCenter: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    var showNotifications by remember { mutableStateOf(false) }
    var showCommandSearch by remember { mutableStateOf(false) }
    var dailySummary by remember { mutableStateOf<DailySummaryDto?>(null) }
    var loadingSummary by remember { mutableStateOf(false) }
    var emailStatus by remember { mutableStateOf<String?>(null) }

    val showChrome = currentRoute in CoopBottomTabs.map { it.route }

    Scaffold(
        containerColor = palette.surface,
        topBar = {
            if (showChrome) {
                Surface(
                    color = palette.surfaceContainerLowest,
                    shadowElevation = 0.dp,
                ) {
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .statusBarsPadding()
                                .height(60.dp)
                                .padding(horizontal = CoopSpacing.md),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            CoopLogo(
                                markSize = 28.dp,
                                subtitle = businessName.takeIf { it.isNotBlank() },
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                CoopSyncStatusChip(
                                    isOnline = syncStatus.isOnline,
                                    isSyncing = syncStatus.isSyncing,
                                    pendingCount = syncStatus.pendingCount,
                                    conflictCount = syncStatus.conflictCount,
                                    onClick = onOpenSyncCenter,
                                )
                                IconButton(onClick = { showCommandSearch = true }) {
                                    Icon(
                                        imageVector = Icons.Rounded.Search,
                                        contentDescription = "Quick jump",
                                        tint = palette.onSurfaceVariant,
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        showNotifications = true
                                        loadingSummary = true
                                        emailStatus = null
                                        scope.launch {
                                            feedbackRepo.getDailySummary()
                                                .onSuccess { dailySummary = it }
                                            loadingSummary = false
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.NotificationsNone,
                                        contentDescription = "Daily Summary",
                                        tint = palette.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        HorizontalDivider(color = palette.borderSubtle)
                    }
                }
            }
        },
        bottomBar = {
            if (showChrome) {
                Surface(
                    color = palette.surfaceContainerLowest,
                ) {
                    Column {
                        HorizontalDivider(color = palette.borderSubtle)
                        NavigationBar(
                            containerColor = palette.surfaceContainerLowest,
                            tonalElevation = 0.dp,
                        ) {
                            CoopBottomTabs.forEach { tab ->
                                val selected = currentRoute == tab.route
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = { onNavigateTab(tab.route) },
                                    icon = {
                                        Icon(
                                            imageVector = tab.icon,
                                            contentDescription = tab.label,
                                        )
                                    },
                                    label = {
                                        Text(
                                            text = tab.label,
                                            style = CoopType.labelCaps.copy(
                                                fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                                                fontSize = 11.sp,
                                                letterSpacing = 0.sp,
                                            ),
                                            maxLines = 1,
                                        )
                                    },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = if (tab.isAi) palette.secondary else palette.primary,
                                        selectedTextColor = if (tab.isAi) palette.secondary else palette.primary,
                                        indicatorColor = if (tab.isAi) palette.secondary.tint(0.14f) else palette.surfaceContainerLow,
                                        unselectedIconColor = palette.onSurfaceVariant,
                                        unselectedTextColor = palette.onSurfaceVariant,
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        },
        content = content,
    )

    if (showNotifications) {
        ModalBottomSheet(
            onDismissRequest = { showNotifications = false },
            containerColor = palette.surfaceContainerLowest,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = CoopSpacing.md, vertical = CoopSpacing.sm)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CoopSectionHeader(
                    title = "Daily Business Summary",
                    subtitle = dailySummary?.date ?: "Today",
                )
                if (loadingSummary) {
                    CoopLoader()
                } else if (dailySummary != null) {
                    val d = dailySummary!!
                    if (notifDailySummary) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            CoopCard(modifier = Modifier.weight(1f), backgroundColor = palette.surfaceContainerLow) {
                                Text("TODAY REVENUE", style = CoopType.labelCaps, color = palette.outline)
                                Text(
                                    MoneyFormatter.format(d.revenueToday, d.currency),
                                    style = CoopType.titleMd,
                                    color = palette.onSurface,
                                )
                                Text("${d.ordersToday} orders", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            }
                            CoopCard(modifier = Modifier.weight(1f), backgroundColor = palette.surfaceContainerLow) {
                                Text("RECEIVABLES", style = CoopType.labelCaps, color = palette.outline)
                                Text(
                                    MoneyFormatter.format(d.outstandingAmount, d.currency),
                                    style = CoopType.titleMd,
                                    color = palette.onSurface,
                                )
                                Text("${d.unpaidOrdersCount} unpaid", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            }
                        }
                    }
                    val visibleHighlights = if (notifLowStock) {
                        d.highlights
                    } else {
                        d.highlights.filterNot { it.contains("stock", ignoreCase = true) }
                    }
                    if (visibleHighlights.isNotEmpty()) {
                        visibleHighlights.forEach { line ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(Icons.Rounded.Circle, contentDescription = null, tint = palette.primary, modifier = Modifier.size(8.dp))
                                Text(line, style = CoopType.bodyCompact, color = palette.onSurface)
                            }
                        }
                    } else if (!notifDailySummary) {
                        Text(
                            "In-app alerts are paused in Settings → Alerts.",
                            style = CoopType.bodyCompact,
                            color = palette.outline,
                        )
                    }
                    if (emailStatus != null) {
                        Text(emailStatus!!, style = CoopType.bodyCompact, color = palette.primary)
                    }
                    CoopSecondaryButton(
                        text = "Email Summary to Owner",
                        leadingIcon = Icons.Rounded.Email,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            scope.launch {
                                feedbackRepo.sendDailySummaryEmail(null)
                                    .onSuccess { emailStatus = "Summary emailed." }
                                    .onFailure { emailStatus = it.message ?: "Email unavailable." }
                            }
                        },
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }

    if (showCommandSearch) {
        var cmdQuery by remember { mutableStateOf("") }
        val allProducts by productRepo.observeProducts().collectAsState(initial = emptyList())
        val allCustomers by customerRepo.observeCustomers().collectAsState(initial = emptyList())
        val allOrders by orderRepo.observeOrders().collectAsState(initial = emptyList())

        val q = cmdQuery.trim()
        val shortcuts = remember(q) {
            listOf(
                "New Order" to CoopRoutes.CREATE_ORDER,
                "Day 1 Briefing" to CoopRoutes.BRIEFING,
                "Reports & Exports" to CoopRoutes.REPORTS,
                "Invoices" to CoopRoutes.INVOICES,
                "Receivables" to CoopRoutes.RECEIVABLES,
                "Import CSV" to CoopRoutes.IMPORT,
                "Sync Center" to CoopRoutes.SYNC_CENTER,
                "Billing & Plans" to CoopRoutes.BILLING,
                "Team & Roles" to CoopRoutes.TEAM,
                "Settings" to CoopRoutes.SETTINGS,
                "Feedback & Support" to CoopRoutes.SUPPORT,
            ).filter { q.isBlank() || it.first.contains(q, ignoreCase = true) }
        }
        val matchedProducts = remember(q, allProducts) {
            if (q.isBlank()) emptyList()
            else allProducts.filter { it.name.contains(q, ignoreCase = true) || it.sku.contains(q, ignoreCase = true) }.take(4)
        }
        val matchedCustomers = remember(q, allCustomers) {
            if (q.isBlank()) emptyList()
            else allCustomers.filter { it.fullName.contains(q, ignoreCase = true) || it.email.contains(q, ignoreCase = true) }.take(4)
        }
        val matchedOrders = remember(q, allOrders) {
            if (q.isBlank()) emptyList()
            else allOrders.filter {
                it.id.toString().contains(q) || (it.customer?.fullName?.contains(q, ignoreCase = true) == true)
            }.take(4)
        }

        AlertDialog(
            onDismissRequest = { showCommandSearch = false },
            containerColor = palette.surfaceContainerLowest,
            title = { Text("Command Palette", style = CoopType.sectionHeading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CoopSearchBar(
                        query = cmdQuery,
                        onQueryChange = { cmdQuery = it },
                        placeholder = "Jump to screen or search records...",
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 320.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (matchedProducts.isNotEmpty()) {
                            Text("PRODUCTS", style = CoopType.labelCaps, color = palette.outline)
                            matchedProducts.forEach { p ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(CoopRadius.md))
                                        .background(palette.surfaceContainerLow)
                                        .clickable {
                                            showCommandSearch = false
                                            onNavigateTab(CoopRoutes.OPS)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text("${p.name} (${p.sku})", style = CoopType.bodyCompact, color = palette.onSurface)
                                    Icon(Icons.Rounded.Inventory2, contentDescription = null, tint = palette.primary, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                        if (matchedCustomers.isNotEmpty()) {
                            Text("CUSTOMERS", style = CoopType.labelCaps, color = palette.outline)
                            matchedCustomers.forEach { c ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(CoopRadius.md))
                                        .background(palette.surfaceContainerLow)
                                        .clickable {
                                            showCommandSearch = false
                                            onOpenCustomer(c.id)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(c.fullName, style = CoopType.bodyCompact, color = palette.onSurface)
                                    Icon(Icons.Rounded.Person, contentDescription = null, tint = palette.primary, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                        if (matchedOrders.isNotEmpty()) {
                            Text("ORDERS", style = CoopType.labelCaps, color = palette.outline)
                            matchedOrders.forEach { o ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(CoopRadius.md))
                                        .background(palette.surfaceContainerLow)
                                        .clickable {
                                            showCommandSearch = false
                                            onOpenOrder(o.id)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text("Order #${o.id} · ${o.customer?.fullName ?: o.status}", style = CoopType.bodyCompact, color = palette.onSurface)
                                    Icon(Icons.Rounded.Receipt, contentDescription = null, tint = palette.primary, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                        if (shortcuts.isNotEmpty()) {
                            Text("GO TO", style = CoopType.labelCaps, color = palette.outline)
                            shortcuts.take(6).forEach { (label, route) ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(CoopRadius.md))
                                        .background(palette.surfaceContainerLow)
                                        .clickable {
                                            showCommandSearch = false
                                            onNavigateRoute(route)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(label, style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold), color = palette.onSurface)
                                    Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.outline)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                CoopGhostButton(text = "Close", onClick = { showCommandSearch = false })
            },
        )
    }
}
