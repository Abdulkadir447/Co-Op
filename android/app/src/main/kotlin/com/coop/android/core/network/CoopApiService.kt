package com.coop.android.core.network

import com.coop.android.core.network.dto.*
import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface CoopApiService {

    // --- Health & Auth -------------------------------------------------------
    @GET("healthcheck")
    suspend fun healthcheck(): JsonObject

    @GET("auth/me")
    suspend fun getAuthMe(): AuthMeDto

    // --- Team ----------------------------------------------------------------
    @GET("team")
    suspend fun getTeam(): TeamResponseDto

    @POST("team/invites")
    suspend fun createInvite(@Body body: TeamInviteCreateDto): TeamInviteOutDto

    @POST("team/invites/accept")
    suspend fun acceptInvite(@Body body: TeamInviteAcceptDto): TeamMemberOutDto

    @DELETE("team/invites/{token}")
    suspend fun revokeInvite(@Path("token") token: String): JsonObject

    @PATCH("team/members/{memberUserId}")
    suspend fun updateMemberRole(
        @Path("memberUserId") memberUserId: String,
        @Body body: TeamRoleUpdateDto,
    ): TeamMemberOutDto

    @DELETE("team/members/{memberUserId}")
    suspend fun removeMember(@Path("memberUserId") memberUserId: String): JsonObject

    // --- Settings, Audit & Backups -------------------------------------------
    @GET("business/settings")
    suspend fun getBusinessSettings(): BusinessSettingsOutDto

    @PATCH("business/settings")
    suspend fun updateBusinessSettings(@Body body: BusinessSettingsUpdateDto): BusinessSettingsOutDto

    @Multipart
    @POST("business/logo")
    suspend fun uploadBusinessLogo(@Part file: MultipartBody.Part): BusinessSettingsOutDto

    @GET("audit")
    suspend fun getAuditLog(@Query("limit") limit: Int = 100): List<AuditEntryOutDto>

    @GET("backups/export")
    suspend fun exportBackup(): Response<ResponseBody>

    @Multipart
    @POST("backups/restore")
    suspend fun restoreBackup(@Part file: MultipartBody.Part): JsonObject

    // --- Products & Inventory ------------------------------------------------
    @POST("products")
    suspend fun createProduct(@Body body: ProductCreateDto): ProductOutDto

    @GET("products")
    suspend fun listProducts(
        @Query("search") search: String? = null,
        @Query("category") category: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): ProductListResponseDto

    @GET("products/{id}")
    suspend fun getProduct(@Path("id") id: Int): ProductOutDto

    @PUT("products/{id}")
    suspend fun updateProduct(
        @Path("id") id: Int,
        @Body body: ProductUpdateDto,
    ): ProductOutDto

    @DELETE("products/{id}")
    suspend fun deleteProduct(@Path("id") id: Int): Response<Unit>

    @POST("products/{id}/adjust")
    suspend fun adjustStock(
        @Path("id") id: Int,
        @Body body: AdjustStockRequestDto,
    ): ProductOutDto

    @GET("products/{id}/movements")
    suspend fun listMovements(
        @Path("id") id: Int,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): MovementListResponseDto

    @GET("inventory/summary")
    suspend fun getInventorySummary(): InventorySummaryDto

    // --- Customers -----------------------------------------------------------
    @POST("customers")
    suspend fun createCustomer(@Body body: CustomerCreateDto): CustomerOutDto

    @GET("customers")
    suspend fun listCustomers(
        @Query("search") search: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): CustomerListResponseDto

    @GET("customers/{id}")
    suspend fun getCustomer(@Path("id") id: Int): CustomerOutDto

    @PUT("customers/{id}")
    suspend fun updateCustomer(
        @Path("id") id: Int,
        @Body body: CustomerUpdateDto,
    ): CustomerOutDto

    @DELETE("customers/{id}")
    suspend fun deleteCustomer(@Path("id") id: Int): Response<Unit>

    // --- Orders, Payments & Receivables --------------------------------------
    @POST("orders")
    suspend fun createOrder(@Body body: OrderCreateDto): OrderOutDto

    @GET("orders")
    suspend fun listOrders(
        @Query("search") search: String? = null,
        @Query("status") status: String? = null,
        @Query("customer_id") customerId: Int? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): OrderListResponseDto

    @GET("orders/{id}")
    suspend fun getOrder(@Path("id") id: Int): OrderOutDto

    @PUT("orders/{id}/status")
    suspend fun updateOrderStatus(
        @Path("id") id: Int,
        @Body body: OrderStatusUpdateDto,
    ): OrderOutDto

    @DELETE("orders/{id}")
    suspend fun deleteOrder(@Path("id") id: Int): Response<Unit>

    @GET("orders/{id}/payments")
    suspend fun getOrderPayments(@Path("id") id: Int): OrderPaymentsResponseDto

    @POST("orders/{id}/payments")
    suspend fun recordOrderPayment(
        @Path("id") id: Int,
        @Body body: OrderPaymentCreateDto,
    ): OrderPaymentsResponseDto

    @DELETE("orders/{id}/payments/{paymentId}")
    suspend fun deleteOrderPayment(
        @Path("id") id: Int,
        @Path("paymentId") paymentId: Int,
    ): OrderPaymentsResponseDto

    @GET("receivables")
    suspend fun listReceivables(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): ReceivablesResponseDto

    // --- Invoices ------------------------------------------------------------
    @POST("invoices")
    suspend fun createInvoice(@Body body: InvoiceCreateRequestDto): InvoiceDetailDto

    @GET("invoices")
    suspend fun listInvoices(
        @Query("search") search: String? = null,
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): InvoiceListResponseDto

    @GET("invoices/{invoiceId}")
    suspend fun getInvoice(@Path("invoiceId") invoiceId: Int): InvoiceDetailDto

    @PATCH("invoices/{invoiceId}")
    suspend fun updateInvoice(
        @Path("invoiceId") invoiceId: Int,
        @Body body: InvoiceUpdateRequestDto,
    ): InvoiceDetailDto

    @GET("invoices/export")
    suspend fun exportInvoicesCsv(
        @Query("format") format: String = "csv",
        @Query("search") search: String? = null,
        @Query("status") status: String? = null,
    ): Response<ResponseBody>

    // --- Dashboard, Briefing & Onboarding ------------------------------------
    @GET("dashboard/summary")
    suspend fun getDashboardSummary(): DashboardSummaryDto

    @GET("dashboard/revenue/timeseries")
    suspend fun getRevenueTimeseries(@Query("days") days: Int = 30): List<TimeseriesPointDto>

    @GET("dashboard/inventory/by-category")
    suspend fun getInventoryByCategory(): List<CategoryValueDto>

    @GET("dashboard/top-products")
    suspend fun getTopProducts(@Query("limit") limit: Int = 5): List<TopProductItemDto>

    @GET("dashboard/briefing")
    suspend fun getDashboardBriefing(): BriefingResponseDto

    @GET("onboarding/state")
    suspend fun getOnboardingState(): OnboardingStateDto

    // --- Reports & Exports ---------------------------------------------------
    @GET("reports/meta")
    suspend fun getReportsMeta(): ReportsMetaDto

    @GET("reports/{key}")
    suspend fun getReport(
        @Path("key") key: String,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("compare") compare: String? = null,
        @Query("category") category: String? = null,
        @Query("product_id") productId: Int? = null,
        @Query("customer_id") customerId: Int? = null,
    ): ReportDataDto

    @GET("reports/{key}/export")
    suspend fun exportReport(
        @Path("key") key: String,
        @Query("format") format: String = "csv",
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("compare") compare: String? = null,
        @Query("category") category: String? = null,
        @Query("product_id") productId: Int? = null,
        @Query("customer_id") customerId: Int? = null,
    ): Response<ResponseBody>

    // --- Intelligent Import --------------------------------------------------
    @GET("imports/schema")
    suspend fun getImportSchema(): JsonObject

    @Multipart
    @POST("imports/preview")
    suspend fun importPreview(@Part file: MultipartBody.Part): ImportPreviewDto

    @POST("imports/map")
    suspend fun importMap(@Body body: ImportMapRequestDto): ImportMapResponseDto

    @Multipart
    @POST("imports/validate")
    suspend fun importValidate(
        @Part file: MultipartBody.Part,
        @Part("entity") entity: RequestBody,
        @Part("mapping") mapping: RequestBody,
    ): ImportValidateResponseDto

    @Multipart
    @POST("imports/commit")
    suspend fun importCommit(
        @Part file: MultipartBody.Part,
        @Part("entity") entity: RequestBody,
        @Part("mapping") mapping: RequestBody,
    ): ImportCommitResponseDto

    // --- AI (Zeno) -----------------------------------------------------------
    @POST("ai/chat")
    suspend fun aiChat(@Body body: AiChatRequestDto): AiChatResponseDto

    @GET("ai/usage")
    suspend fun getAiUsage(): AiUsageResponseDto

    @GET("ai/forecast")
    suspend fun getAiForecast(): AiForecastResponseDto

    @GET("ai/history")
    suspend fun getAiHistory(
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0,
    ): AiHistoryResponseDto

    @DELETE("ai/history")
    suspend fun clearAiHistory(): JsonObject

    @GET("ai/lessons")
    suspend fun getZenoLessons(
        @Query("status") status: String? = null,
        @Query("kind") kind: String? = null,
        @Query("limit") limit: Int = 50,
    ): ZenoLessonsResponseDto

    @POST("ai/lessons")
    suspend fun createZenoLesson(@Body body: JsonObject): ZenoLessonItemDto

    @PATCH("ai/lessons/{lessonId}")
    suspend fun updateZenoLesson(
        @Path("lessonId") lessonId: Int,
        @Body body: JsonObject,
    ): ZenoLessonItemDto

    // --- Billing, Checkout & Licensing ---------------------------------------
    @GET("billing/summary")
    suspend fun getBillingSummary(): BillingSummaryDto

    @POST("billing/plan")
    suspend fun changeBillingPlan(@Body body: BillingPlanRequestDto): BillingSummaryDto

    @POST("billing/trial")
    suspend fun startBillingTrial(@Body body: BillingPlanRequestDto): BillingSummaryDto

    @GET("billing/payment-config")
    suspend fun getPaymentConfig(): PaymentConfigDto

    @POST("billing/checkout")
    suspend fun startCheckout(@Body body: BillingCheckoutRequestDto): BillingCheckoutResponseDto

    @GET("billing/payments")
    suspend fun listBillingPayments(@Query("limit") limit: Int = 20): BillingPaymentsListDto

    @POST("billing/payments/verify")
    suspend fun verifyPayment(@Body body: VerifyPaymentRequestDto): JsonObject

    @GET("licenses")
    suspend fun getLicenseStatus(): LicenseStatusResponseDto

    @POST("licenses/activate")
    suspend fun activateLicense(@Body body: LicenseActivateRequestDto): BillingSummaryDto

    // --- Notifications, Feedback & Support -----------------------------------
    @GET("notifications/daily-summary")
    suspend fun getDailySummary(): DailySummaryDto

    @POST("notifications/summary/send")
    suspend fun sendDailySummary(@Body body: JsonObject): JsonObject

    @GET("feedback/status")
    suspend fun getFeedbackStatus(): FeedbackStatusDto

    @POST("feedback")
    suspend fun submitFeedback(@Body body: FeedbackSubmitDto): FeedbackStatusDto

    @POST("feedback/dismiss")
    suspend fun dismissFeedback(): FeedbackStatusDto

    @GET("feedback")
    suspend fun listFeedback(@Query("limit") limit: Int = 50): List<FeedbackOutDto>

    @POST("support/issues")
    suspend fun submitIssue(@Body body: IssueReportInDto): IssueReportOutDto

    @GET("support/issues")
    suspend fun listIssues(): List<IssueReportOutDto>

    // --- Offline Sync --------------------------------------------------------
    @GET("sync/pull")
    suspend fun syncPull(@Query("since") since: String? = null): SyncPullResponseDto

    @POST("sync/push")
    suspend fun syncPush(@Body body: SyncPushRequestDto): SyncPushResponseDto

    // --- Platform Admin ------------------------------------------------------
    @GET("platform/me")
    suspend fun getPlatformMe(): PlatformMeDto

    @GET("platform/overview")
    suspend fun getPlatformOverview(): PlatformOverviewDto

    @GET("platform/investor-metrics")
    suspend fun getPlatformInvestorMetrics(
        @Query("window_days") windowDays: Int = 28,
    ): PlatformInvestorMetricsDto

    @GET("platform/feedback")
    suspend fun getPlatformFeedback(@Query("limit") limit: Int = 100): PlatformFeedbackResponseDto

    @GET("platform/businesses")
    suspend fun getPlatformBusinesses(@Query("limit") limit: Int = 200): PlatformBusinessesResponseDto

    @GET("platform/licenses")
    suspend fun getPlatformLicenses(@Query("limit") limit: Int = 200): PlatformLicensesResponseDto

    // --- Admin Licence Minting/Revoking & Webhooks ---------------------------
    @POST("admin/generate-license")
    suspend fun adminGenerateLicense(
        @Header("X-Admin-Token") adminToken: String,
        @Body body: AdminGenerateLicenseRequestDto,
    ): AdminIssuedLicenseDto

    @POST("admin/licenses/revoke")
    suspend fun adminRevokeLicense(
        @Header("X-Admin-Token") adminToken: String,
        @Body body: AdminRevokeLicenseRequestDto,
    ): AdminRevokeLicenseResponseDto

    @POST("webhooks/paystack")
    suspend fun sendPaystackWebhook(
        @Header("x-paystack-signature") signature: String,
        @Body rawBody: RequestBody,
    ): JsonObject
}
