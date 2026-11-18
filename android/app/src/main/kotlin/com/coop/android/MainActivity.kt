package com.coop.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.coop.android.core.network.dto.AiReportRefDto
import com.coop.android.core.network.dto.FeedbackStatusDto
import com.coop.android.core.network.dto.TeamInviteOutDto
import com.coop.android.ui.components.CoopLoader
import com.coop.android.ui.navigation.CoopRoutes
import com.coop.android.ui.screens.ai.CoopAiScreen
import com.coop.android.ui.screens.auth.InviteAcceptScreen
import com.coop.android.ui.screens.auth.SignInScreen
import com.coop.android.ui.screens.auth.WelcomeOnboardingScreen
import com.coop.android.ui.screens.billing.BillingScreen
import com.coop.android.ui.screens.briefing.BriefingScreen
import com.coop.android.ui.screens.clients.CustomerDetailScreen
import com.coop.android.ui.screens.clients.CustomersScreen
import com.coop.android.ui.screens.dashboard.DashboardScreen
import com.coop.android.ui.screens.more.MoreHubScreen
import com.coop.android.ui.screens.ops.*
import com.coop.android.ui.screens.reports.ReportsScreen
import com.coop.android.ui.screens.settings.SettingsScreen
import com.coop.android.ui.screens.support.FeedbackPromptDialog
import com.coop.android.ui.screens.support.PlatformAdminScreen
import com.coop.android.ui.screens.support.SupportScreen
import com.coop.android.ui.screens.sync.SyncCenterScreen
import com.coop.android.ui.screens.team.TeamScreen
import com.coop.android.ui.shell.CoopAppScaffold
import com.coop.android.ui.theme.CoopTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val container = (application as CoopApplication).container

        setContent {
            val session by container.sessionManager.state.collectAsState()
            val syncStatus by container.syncEngine.status.collectAsState()

            CoopTheme(themeMode = session.themeMode) {
                CoopRootApp(
                    container = container,
                    session = session,
                    syncStatus = syncStatus,
                )
            }
        }
    }
}

@Composable
private fun CoopRootApp(
    container: com.coop.android.core.di.AppContainer,
    session: com.coop.android.core.auth.SessionState,
    syncStatus: com.coop.android.core.sync.SyncStatusState,
) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    var pendingInvite by remember { mutableStateOf<TeamInviteOutDto?>(null) }
    var gateChecked by remember { mutableStateOf(false) }
    var feedbackDue by remember { mutableStateOf<FeedbackStatusDto?>(null) }
    var pendingReportForAi by remember { mutableStateOf<Pair<String, AiReportRefDto>?>(null) }

    // Gate check whenever signed-in state turns true
    LaunchedEffect(session.isSignedIn, session.isDemoMode) {
        if (!session.isSignedIn) {
            pendingInvite = null
            feedbackDue = null
            gateChecked = true
            return@LaunchedEffect
        }
        gateChecked = false
        if (session.isDemoMode) {
            container.syncEngine.seedDemoDataIfEmpty()
            gateChecked = true
        } else {
            container.identityTeamRepository.fetchMe().onSuccess { me ->
                pendingInvite = me.pendingInvitation
                if (me.pendingInvitation == null) {
                    container.syncEngine.syncNow()
                    if (!session.startedManualOnboarding) {
                        val onb = container.dashboardBriefingRepository.getOnboardingState().getOrNull()
                        if (onb != null && !onb.hasData) {
                            navController.navigate(CoopRoutes.WELCOME) {
                                popUpTo(navController.graph.findStartDestination().id) { inclusive = false }
                            }
                        }
                    }
                    container.feedbackSupportPlatformRepository.getFeedbackStatus()
                        .onSuccess { st -> if (st.due) feedbackDue = st }
                }
            }
            gateChecked = true
        }
    }

    if (!session.isSignedIn) {
        SignInScreen(
            sessionManager = container.sessionManager,
            sessionState = session,
            identityRepo = container.identityTeamRepository,
            syncEngine = container.syncEngine,
            onSignedIn = { container.sessionManager.clearSessionExpiredNotice() },
        )
        return
    }

    if (!gateChecked) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CoopLoader(label = "Loading workspace...")
        }
        return
    }

    if (pendingInvite != null) {
        InviteAcceptScreen(
            invite = pendingInvite!!,
            onAccept = {
                val tok = pendingInvite!!.token
                scope.launch {
                    container.identityTeamRepository.acceptInvite(tok).onSuccess {
                        pendingInvite = null
                        container.identityTeamRepository.fetchMe()
                        container.syncEngine.syncNow()
                    }
                }
            },
            onDeclineSignOut = { container.sessionManager.signOut() },
        )
        return
    }

    fun navigateToLink(link: String) {
        when {
            link.startsWith("/orders/new") -> navController.navigate(CoopRoutes.createOrder())
            link.startsWith("/orders") -> navController.navigate(CoopRoutes.OPS)
            link.startsWith("/products") -> navController.navigate(CoopRoutes.OPS)
            link.startsWith("/inventory") -> navController.navigate(CoopRoutes.OPS)
            link.startsWith("/customers") -> navController.navigate(CoopRoutes.CLIENTS)
            link.startsWith("/reports") -> navController.navigate(CoopRoutes.REPORTS)
            link.startsWith("/billing") -> navController.navigate(CoopRoutes.BILLING)
            link.startsWith("/invoices") -> navController.navigate(CoopRoutes.INVOICES)
            link.startsWith("/receivables") -> navController.navigate(CoopRoutes.RECEIVABLES)
            else -> navController.navigate(CoopRoutes.HOME)
        }
    }

    CoopAppScaffold(
        currentRoute = currentRoute,
        businessName = session.businessName,
        syncStatus = syncStatus,
        notifDailySummary = session.notifDailySummary,
        notifLowStock = session.notifLowStock,
        feedbackRepo = container.feedbackSupportPlatformRepository,
        productRepo = container.productRepository,
        customerRepo = container.customerRepository,
        orderRepo = container.orderRepository,
        onNavigateTab = { tabRoute ->
            navController.navigate(tabRoute) {
                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        },
        onNavigateRoute = { route -> navController.navigate(route) },
        onOpenOrder = { id -> navController.navigate(CoopRoutes.orderDetail(id)) },
        onOpenCustomer = { id -> navController.navigate(CoopRoutes.customerDetail(id)) },
        onOpenSyncCenter = { navController.navigate(CoopRoutes.SYNC_CENTER) },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = CoopRoutes.HOME,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(CoopRoutes.WELCOME) {
                WelcomeOnboardingScreen(
                    businessName = session.businessName,
                    onGoImport = {
                        container.sessionManager.markStartedManualOnboarding()
                        navController.navigate(CoopRoutes.IMPORT) {
                            popUpTo(CoopRoutes.WELCOME) { inclusive = true }
                        }
                    },
                    onStartScratch = {
                        container.sessionManager.markStartedManualOnboarding()
                        navController.navigate(CoopRoutes.HOME) {
                            popUpTo(CoopRoutes.WELCOME) { inclusive = true }
                        }
                    },
                )
            }

            composable(CoopRoutes.HOME) {
                DashboardScreen(
                    repo = container.dashboardBriefingRepository,
                    orderRepo = container.orderRepository,
                    productRepo = container.productRepository,
                    syncStatus = syncStatus,
                    currency = session.currency,
                    businessName = session.businessName,
                    onCreateOrder = { navController.navigate(CoopRoutes.createOrder()) },
                    onOpenOrder = { id -> navController.navigate(CoopRoutes.orderDetail(id)) },
                    onOpenBriefing = { navController.navigate(CoopRoutes.BRIEFING) },
                    onOpenAskZeno = { navController.navigate(CoopRoutes.COOP_AI) },
                    onOpenInventory = { navController.navigate(CoopRoutes.OPS) },
                    onOpenReports = { navController.navigate(CoopRoutes.REPORTS) },
                    onOpenSyncCenter = { navController.navigate(CoopRoutes.SYNC_CENTER) },
                )
            }

            composable(CoopRoutes.OPS) {
                OpsHubScreen(
                    productRepo = container.productRepository,
                    orderRepo = container.orderRepository,
                    role = session.role,
                    currency = session.currency,
                    onCreateOrder = { navController.navigate(CoopRoutes.createOrder()) },
                    onOpenOrder = { id -> navController.navigate(CoopRoutes.orderDetail(id)) },
                    onOpenInvoices = { navController.navigate(CoopRoutes.INVOICES) },
                    onOpenReceivables = { navController.navigate(CoopRoutes.RECEIVABLES) },
                    onOpenImport = { navController.navigate(CoopRoutes.IMPORT) },
                )
            }

            composable(CoopRoutes.COOP_AI) {
                CoopAiScreen(
                    aiRepo = container.aiRepository,
                    billingRepo = container.billingLicenseRepository,
                    currency = session.currency,
                    pendingReportContext = pendingReportForAi,
                    onConsumedReportContext = { pendingReportForAi = null },
                    onDraftOrder = { cid, pid, qty ->
                        navController.navigate(CoopRoutes.createOrder(cid, pid, qty))
                    },
                    onOpenBilling = { navController.navigate(CoopRoutes.BILLING) },
                    onNavigateLink = ::navigateToLink,
                )
            }

            composable(CoopRoutes.CLIENTS) {
                CustomersScreen(
                    customerRepo = container.customerRepository,
                    role = session.role,
                    onOpenCustomer = { id -> navController.navigate(CoopRoutes.customerDetail(id)) },
                )
            }

            composable(CoopRoutes.MORE) {
                MoreHubScreen(
                    session = session,
                    syncStatus = syncStatus,
                    onNavigate = { route -> navController.navigate(route) },
                    onSignOut = { container.sessionManager.signOut() },
                )
            }

            composable(CoopRoutes.BRIEFING) {
                BriefingScreen(
                    repo = container.dashboardBriefingRepository,
                    onDraftFollowUp = { action ->
                        navController.navigate(
                            CoopRoutes.createOrder(
                                customerId = action.customerId,
                                productId = action.productId,
                                quantity = action.quantity,
                            ),
                        )
                    },
                    onNavigateLink = ::navigateToLink,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(
                route = "${CoopRoutes.CREATE_ORDER}?customerId={customerId}&productId={productId}&quantity={quantity}",
                arguments = listOf(
                    navArgument("customerId") { type = NavType.IntType; defaultValue = -1 },
                    navArgument("productId") { type = NavType.IntType; defaultValue = -1 },
                    navArgument("quantity") { type = NavType.IntType; defaultValue = 1 },
                ),
            ) { entry ->
                val cid = entry.arguments?.getInt("customerId")?.takeIf { it > 0 }
                val pid = entry.arguments?.getInt("productId")?.takeIf { it > 0 }
                val qty = entry.arguments?.getInt("quantity")?.takeIf { it > 0 }
                CreateOrderScreen(
                    customerRepo = container.customerRepository,
                    productRepo = container.productRepository,
                    orderRepo = container.orderRepository,
                    settingsRepo = container.settingsBackupRepository,
                    currency = session.currency,
                    prefillCustomerId = cid,
                    prefillProductId = pid,
                    prefillQuantity = qty,
                    onOrderCreated = { createdId ->
                        navController.navigate(CoopRoutes.orderDetail(createdId)) {
                            popUpTo(CoopRoutes.OPS)
                        }
                    },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(
                route = CoopRoutes.ORDER_DETAIL,
                arguments = listOf(navArgument("orderId") { type = NavType.IntType }),
            ) { entry ->
                val id = entry.arguments?.getInt("orderId") ?: 0
                OrderDetailScreen(
                    orderId = id,
                    orderRepo = container.orderRepository,
                    invoiceReceivablesRepo = container.invoiceReceivablesRepository,
                    settingsRepo = container.settingsBackupRepository,
                    businessName = session.businessName,
                    role = session.role,
                    currency = session.currency,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(
                route = CoopRoutes.CUSTOMER_DETAIL,
                arguments = listOf(navArgument("customerId") { type = NavType.IntType }),
            ) { entry ->
                val id = entry.arguments?.getInt("customerId") ?: 0
                CustomerDetailScreen(
                    customerId = id,
                    customerRepo = container.customerRepository,
                    orderRepo = container.orderRepository,
                    role = session.role,
                    currency = session.currency,
                    onCreateOrderForCustomer = { cid -> navController.navigate(CoopRoutes.createOrder(customerId = cid)) },
                    onOpenOrder = { oid -> navController.navigate(CoopRoutes.orderDetail(oid)) },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.INVOICES) {
                InvoicesScreen(
                    repo = container.invoiceReceivablesRepository,
                    currency = session.currency,
                    onOpenOrder = { oid -> navController.navigate(CoopRoutes.orderDetail(oid)) },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.RECEIVABLES) {
                ReceivablesScreen(
                    repo = container.invoiceReceivablesRepository,
                    currency = session.currency,
                    onOpenOrder = { oid -> navController.navigate(CoopRoutes.orderDetail(oid)) },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.IMPORT) {
                ImportScreen(
                    repo = container.importRepository,
                    onDone = {
                        scope.launch { container.syncEngine.syncNow(forceFullPull = true) }
                        navController.navigate(CoopRoutes.HOME) {
                            popUpTo(CoopRoutes.HOME) { inclusive = true }
                        }
                    },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.REPORTS) {
                ReportsScreen(
                    repo = container.reportRepository,
                    currency = session.currency,
                    onAskZenoAboutReport = { title, ref ->
                        pendingReportForAi = title to ref
                        navController.navigate(CoopRoutes.COOP_AI) {
                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                        }
                    },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.SYNC_CENTER) {
                SyncCenterScreen(
                    syncEngine = container.syncEngine,
                    syncStatus = syncStatus,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.BILLING) {
                BillingScreen(
                    repo = container.billingLicenseRepository,
                    userEmail = session.email,
                    currentRole = session.role,
                    onOpenSupport = { navController.navigate(CoopRoutes.SUPPORT) },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.TEAM) {
                TeamScreen(
                    repo = container.identityTeamRepository,
                    currentRole = session.role,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.SETTINGS) {
                SettingsScreen(
                    repo = container.settingsBackupRepository,
                    feedbackRepo = container.feedbackSupportPlatformRepository,
                    sessionManager = container.sessionManager,
                    sessionState = session,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.SUPPORT) {
                SupportScreen(
                    repo = container.feedbackSupportPlatformRepository,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(CoopRoutes.PLATFORM_ADMIN) {
                PlatformAdminScreen(
                    repo = container.feedbackSupportPlatformRepository,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }

    if (feedbackDue != null) {
        FeedbackPromptDialog(
            status = feedbackDue!!,
            repo = container.feedbackSupportPlatformRepository,
            onDismissedOrSubmitted = { feedbackDue = null },
        )
    }
}
