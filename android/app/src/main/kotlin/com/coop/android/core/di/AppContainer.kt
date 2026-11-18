package com.coop.android.core.di

import android.content.Context
import com.coop.android.core.auth.SessionManager
import com.coop.android.core.local.CoopDatabase
import com.coop.android.core.network.ApiClientFactory
import com.coop.android.core.network.CoopApiService
import com.coop.android.core.sync.ConnectivityObserver
import com.coop.android.core.sync.SyncEngine
import com.coop.android.data.repository.*

class AppContainer(context: Context) {
    val appContext: Context = context.applicationContext
    val sessionManager = SessionManager(appContext)
    val database: CoopDatabase = CoopDatabase.getInstance(appContext)
    val apiService: CoopApiService = ApiClientFactory.create(sessionManager)
    val connectivityObserver = ConnectivityObserver(appContext)

    val syncEngine = SyncEngine(
        context = appContext,
        db = database,
        api = apiService,
        sessionManager = sessionManager,
        connectivity = connectivityObserver,
    )

    val identityTeamRepository = IdentityTeamRepository(apiService, sessionManager)
    val productRepository = ProductRepository(database, apiService, syncEngine, sessionManager)
    val customerRepository = CustomerRepository(database, apiService, syncEngine, sessionManager)
    val orderRepository = OrderRepository(database, apiService, syncEngine, sessionManager)
    val invoiceReceivablesRepository = InvoiceReceivablesRepository(database, apiService, sessionManager)
    val dashboardBriefingRepository = DashboardBriefingRepository(database, apiService, syncEngine, sessionManager)
    val reportRepository = ReportRepository(database, apiService, syncEngine, sessionManager)
    val importRepository = ImportRepository(apiService)
    val aiRepository = AiRepository(apiService, sessionManager)
    val settingsBackupRepository = SettingsBackupRepository(apiService, sessionManager)
    val billingLicenseRepository = BillingLicenseRepository(apiService, sessionManager)
    val feedbackSupportPlatformRepository = FeedbackSupportPlatformRepository(apiService, sessionManager)
}
