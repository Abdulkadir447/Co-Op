package com.coop.android.data.repository

import com.coop.android.core.auth.SessionManager
import com.coop.android.core.network.CoopApiService
import com.coop.android.core.network.dto.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class IdentityTeamRepository(
    private val api: CoopApiService,
    private val session: SessionManager,
) {
    suspend fun fetchMe(): Result<AuthMeDto> = runCatching {
        if (session.state.value.isDemoMode) {
            val st = session.state.value
            AuthMeDto(
                userId = st.userId ?: "demo_owner",
                businessId = 1,
                businessName = st.businessName,
                currency = st.currency,
                role = st.role,
                email = st.email,
            )
        } else {
            val me = api.getAuthMe()
            session.updateIdentity(me)
            me
        }
    }

    suspend fun getTeam(): Result<TeamResponseDto> = runCatching {
        if (session.state.value.isDemoMode) TeamResponseDto() else api.getTeam()
    }

    suspend fun createInvite(email: String, role: String): Result<TeamInviteOutDto> = runCatching {
        api.createInvite(TeamInviteCreateDto(email = email.trim(), role = role))
    }

    suspend fun acceptInvite(token: String): Result<TeamMemberOutDto> = runCatching {
        api.acceptInvite(TeamInviteAcceptDto(token))
    }

    suspend fun revokeInvite(token: String): Result<Unit> = runCatching {
        api.revokeInvite(token)
    }

    suspend fun updateMemberRole(userId: String, role: String): Result<TeamMemberOutDto> = runCatching {
        api.updateMemberRole(userId, TeamRoleUpdateDto(role))
    }

    suspend fun removeMember(userId: String): Result<Unit> = runCatching {
        api.removeMember(userId)
    }
}

class SettingsBackupRepository(
    private val api: CoopApiService,
    private val session: SessionManager,
) {
    suspend fun getSettings(): Result<BusinessSettingsOutDto> = runCatching {
        if (session.state.value.isDemoMode) {
            BusinessSettingsOutDto(
                name = session.state.value.businessName,
                currency = session.state.value.currency,
                ownerEmail = session.state.value.email,
                aiResponseStyle = "standard",
                taxEnabled = true,
                taxRate = 7.5,
                taxLabel = "VAT",
            )
        } else {
            val s = api.getBusinessSettings()
            session.updateCurrency(s.currency)
            s
        }
    }

    suspend fun updateSettings(req: BusinessSettingsUpdateDto): Result<BusinessSettingsOutDto> = runCatching {
        val updated = api.updateBusinessSettings(req)
        session.updateCurrency(updated.currency)
        updated
    }

    suspend fun uploadLogo(filename: String, mimeType: String, bytes: ByteArray): Result<BusinessSettingsOutDto> = runCatching {
        require(bytes.size <= 5 * 1024 * 1024) { "Logo must be 5 MB or smaller." }
        val media = (mimeType.ifBlank { "image/png" }).toMediaType()
        val part = MultipartBody.Part.createFormData("file", filename, bytes.toRequestBody(media))
        api.uploadBusinessLogo(part)
    }

    suspend fun getAuditLog(limit: Int = 100): Result<List<AuditEntryOutDto>> = runCatching {
        if (session.state.value.isDemoMode) emptyList() else api.getAuditLog(limit)
    }

    suspend fun exportCloudBackup(): Result<ByteArray> = runCatching {
        val resp = api.exportBackup()
        resp.body()?.bytes() ?: error("Empty backup snapshot")
    }

    suspend fun restoreCloudBackup(filename: String, bytes: ByteArray): Result<JsonObject> = runCatching {
        val part = MultipartBody.Part.createFormData(
            "file",
            filename,
            bytes.toRequestBody("application/json".toMediaType()),
        )
        api.restoreBackup(part)
    }
}

class BillingLicenseRepository(
    private val api: CoopApiService,
    private val session: SessionManager,
) {
    suspend fun getBillingSummary(): Result<BillingSummaryDto> = runCatching {
        if (session.state.value.isDemoMode) {
            BillingSummaryDto(
                plan = "professional",
                label = "Professional (Demo)",
                granted = 1000,
                used = 12,
                remaining = 988,
                basePlan = "free",
                trial = BillingTrialStateDto(available = false, active = true, daysRemaining = 10, plan = "professional", label = "Professional"),
            )
        } else {
            api.getBillingSummary()
        }
    }

    suspend fun changePlan(plan: String): Result<BillingSummaryDto> = runCatching {
        api.changeBillingPlan(BillingPlanRequestDto(plan))
    }

    suspend fun startTrial(plan: String): Result<BillingSummaryDto> = runCatching {
        api.startBillingTrial(BillingPlanRequestDto(plan))
    }

    suspend fun getPaymentConfig(): Result<PaymentConfigDto> = runCatching {
        if (session.state.value.isDemoMode) PaymentConfigDto() else api.getPaymentConfig()
    }

    suspend fun startCheckout(plan: String, interval: String, email: String?): Result<BillingCheckoutResponseDto> =
        runCatching {
            api.startCheckout(BillingCheckoutRequestDto(plan = plan, interval = interval, email = email))
        }

    suspend fun listPayments(): Result<List<BillingPaymentRecordDto>> = runCatching {
        if (session.state.value.isDemoMode) emptyList() else api.listBillingPayments().items
    }

    suspend fun verifyPayment(reference: String): Result<JsonObject> = runCatching {
        api.verifyPayment(VerifyPaymentRequestDto(reference))
    }

    suspend fun getLicenseStatus(): Result<LicenseStatusResponseDto> = runCatching {
        if (session.state.value.isDemoMode) LicenseStatusResponseDto() else api.getLicenseStatus()
    }

    suspend fun activateLicense(key: String): Result<BillingSummaryDto> = runCatching {
        api.activateLicense(LicenseActivateRequestDto(key.trim()))
    }
}

class FeedbackSupportPlatformRepository(
    private val api: CoopApiService,
    private val session: SessionManager,
) {
    suspend fun getDailySummary(): Result<DailySummaryDto> = runCatching {
        if (session.state.value.isDemoMode) {
            DailySummaryDto(
                date = "Today",
                businessName = session.state.value.businessName,
                currency = session.state.value.currency,
                ordersToday = 1,
                revenueToday = 213.0,
                lowStockCount = 1,
                outOfStockCount = 1,
                unpaidOrdersCount = 1,
                outstandingAmount = 128.98,
                highlights = listOf("Precision Burr Grinder is out of stock.", "Ceremonial Matcha Tin is below reorder level."),
            )
        } else {
            api.getDailySummary()
        }
    }

    suspend fun sendDailySummaryEmail(email: String?): Result<Unit> = runCatching {
        val body = buildJsonObject {
            if (!email.isNullOrBlank()) put("email", email.trim())
        }
        api.sendDailySummary(body)
    }

    suspend fun getFeedbackStatus(): Result<FeedbackStatusDto> = runCatching {
        if (session.state.value.isDemoMode) FeedbackStatusDto() else api.getFeedbackStatus()
    }

    suspend fun submitFeedback(req: FeedbackSubmitDto): Result<FeedbackStatusDto> = runCatching {
        api.submitFeedback(req)
    }

    suspend fun dismissFeedback(): Result<FeedbackStatusDto> = runCatching {
        api.dismissFeedback()
    }

    suspend fun listFeedback(): Result<List<FeedbackOutDto>> = runCatching {
        if (session.state.value.isDemoMode) emptyList() else api.listFeedback()
    }

    suspend fun listIssues(): Result<List<IssueReportOutDto>> = runCatching {
        if (session.state.value.isDemoMode) emptyList() else api.listIssues()
    }

    suspend fun submitIssue(req: IssueReportInDto): Result<IssueReportOutDto> = runCatching {
        api.submitIssue(req)
    }

    suspend fun getPlatformMe(): Result<PlatformMeDto> = runCatching {
        if (session.state.value.isDemoMode) PlatformMeDto(isAdmin = false) else api.getPlatformMe()
    }

    suspend fun getPlatformOverview(): Result<PlatformOverviewDto> = runCatching {
        api.getPlatformOverview()
    }

    suspend fun getPlatformInvestorMetrics(windowDays: Int = 28): Result<PlatformInvestorMetricsDto> = runCatching {
        api.getPlatformInvestorMetrics(windowDays)
    }

    suspend fun getPlatformFeedback(limit: Int = 100): Result<List<PlatformFeedbackItemDto>> = runCatching {
        api.getPlatformFeedback(limit).items
    }

    suspend fun getPlatformBusinesses(limit: Int = 200): Result<List<PlatformBusinessItemDto>> = runCatching {
        api.getPlatformBusinesses(limit).items
    }

    suspend fun getPlatformLicenses(limit: Int = 200): Result<List<PlatformLicenseItemDto>> = runCatching {
        api.getPlatformLicenses(limit).items
    }

    suspend fun adminGenerateLicense(
        adminToken: String,
        businessId: Int,
        plan: String,
        days: Int?,
        seats: Int,
    ): Result<AdminIssuedLicenseDto> = runCatching {
        api.adminGenerateLicense(
            adminToken = adminToken.trim(),
            body = AdminGenerateLicenseRequestDto(
                businessId = businessId,
                plan = plan,
                days = days,
                seats = seats,
            ),
        )
    }

    suspend fun adminRevokeLicense(
        adminToken: String,
        fingerprintOrKey: String,
        reason: String?,
    ): Result<AdminRevokeLicenseResponseDto> = runCatching {
        val clean = fingerprintOrKey.trim()
        val req = if (clean.uppercase().startsWith("COOP-")) {
            AdminRevokeLicenseRequestDto(licenseKey = clean, reason = reason?.trim()?.takeIf { it.isNotBlank() })
        } else {
            AdminRevokeLicenseRequestDto(fingerprint = clean, reason = reason?.trim()?.takeIf { it.isNotBlank() })
        }
        api.adminRevokeLicense(adminToken = adminToken.trim(), body = req)
    }

    suspend fun triggerPaystackWebhook(
        paystackSecretKey: String,
        reference: String,
        event: String = "charge.success",
    ): Result<JsonObject> = runCatching {
        val rawJson = """{"event":"$event","data":{"reference":"${reference.trim()}","status":"success"}}"""
        val mac = javax.crypto.Mac.getInstance("HmacSHA512")
        mac.init(javax.crypto.spec.SecretKeySpec(paystackSecretKey.trim().toByteArray(Charsets.UTF_8), "HmacSHA512"))
        val sig = mac.doFinal(rawJson.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val body = rawJson.toRequestBody("application/json".toMediaType())
        api.sendPaystackWebhook(signature = sig, rawBody = body)
    }
}
