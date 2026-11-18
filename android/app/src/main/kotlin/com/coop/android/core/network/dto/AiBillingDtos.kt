package com.coop.android.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class AiReportRefDto(
    val key: String,
    @SerialName("from") val fromDate: String? = null,
    val to: String? = null,
    val compare: String? = null,
    val category: String? = null,
    @SerialName("product_id") val productId: Int? = null,
    @SerialName("customer_id") val customerId: Int? = null,
)

@Serializable
data class AiChatRequestDto(
    val question: String,
    val history: List<Map<String, String>>? = null,
    @SerialName("request_id") val requestId: String? = null,
    val report: AiReportRefDto? = null,
)

@Serializable
data class AiBasisDto(
    val period: String? = null,
    val sources: List<String> = emptyList(),
)

@Serializable
data class AiLinkDto(
    val label: String,
    val to: String,
)

@Serializable
data class AiActionDto(
    val type: String,
    val parameters: JsonObject = JsonObject(emptyMap()),
    val resolved: JsonObject? = null,
)

@Serializable
data class AiChatResponseDto(
    val type: String = "answer",
    val kind: String = "fact",
    val title: String = "",
    val message: String = "",
    val basis: AiBasisDto = AiBasisDto(),
    @SerialName("follow_ups") val followUps: List<String> = emptyList(),
    val links: List<AiLinkDto> = emptyList(),
    val actions: List<AiActionDto> = emptyList(),
    @SerialName("actions_rejected") val actionsRejected: List<JsonElement> = emptyList(),
    val source: String? = null,
    val model: String? = null,
    @SerialName("credits_used") val creditsUsed: Int = 0,
)

@Serializable
data class AiUsageResponseDto(
    val month: String,
    val requests: Int = 0,
    @SerialName("input_tokens") val inputTokens: Int = 0,
    @SerialName("output_tokens") val outputTokens: Int = 0,
    @SerialName("credits_used") val creditsUsed: Int = 0,
)

@Serializable
data class ForecastMonthDto(
    val key: String,
    val label: String,
    val revenue: Double = 0.0,
    val orders: Int = 0,
    @SerialName("in_progress") val inProgress: Boolean = false,
)

@Serializable
data class ForecastEstimateDto(
    val period: String,
    @SerialName("period_label") val periodLabel: String,
    val estimated: Double = 0.0,
    val low: Double = 0.0,
    val high: Double = 0.0,
    @SerialName("trend_percent") val trendPercent: Double? = null,
    @SerialName("completed_months_used") val completedMonthsUsed: Int = 0,
)

@Serializable
data class AiForecastResponseDto(
    val available: Boolean = false,
    val reason: String? = null,
    val currency: String = "USD",
    @SerialName("as_of") val asOf: String? = null,
    val method: String = "",
    val months: List<ForecastMonthDto> = emptyList(),
    @SerialName("completed_months") val completedMonths: Int = 0,
    @SerialName("required_months") val requiredMonths: Int = 3,
    val forecast: ForecastEstimateDto? = null,
)

@Serializable
data class AiHistoryItemDto(
    val id: Int,
    val question: String,
    @SerialName("answer_kind") val answerKind: String? = null,
    @SerialName("answer_title") val answerTitle: String? = null,
    @SerialName("answer_summary") val answerSummary: String? = null,
    @SerialName("report_key") val reportKey: String? = null,
    val model: String? = null,
    @SerialName("credits_used") val creditsUsed: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class AiHistoryResponseDto(
    val items: List<AiHistoryItemDto> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class ZenoLessonItemDto(
    val id: Int,
    val kind: String,
    val scope: String,
    val statement: String,
    val severity: Int = 3,
    @SerialName("severity_label") val severityLabel: String? = null,
    @SerialName("cost_amount") val costAmount: Double? = null,
    @SerialName("cost_basis") val costBasis: String? = null,
    @SerialName("blast_radius") val blastRadius: Int = 0,
    @SerialName("repeat_count") val repeatCount: Int = 1,
    val status: String = "active",
    val source: String? = null,
    @SerialName("evidence_ref") val evidenceRef: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class ZenoLessonsResponseDto(
    val items: List<ZenoLessonItemDto> = emptyList(),
    val severities: Map<String, String> = emptyMap(),
)

@Serializable
data class BillingPeriodDto(
    val start: String? = null,
    val end: String? = null,
)

@Serializable
data class BillingTrialStateDto(
    val available: Boolean = false,
    val active: Boolean = false,
    val used: Boolean = false,
    val expired: Boolean = false,
    val plan: String? = null,
    val label: String? = null,
    val days: Int = 10,
    @SerialName("days_remaining") val daysRemaining: Int = 0,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("ends_at") val endsAt: String? = null,
)

@Serializable
data class BillingLicenseStateDto(
    val licensed: Boolean = false,
    val active: Boolean = false,
    val plan: String? = null,
    val label: String? = null,
    val seats: Int? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("days_remaining") val daysRemaining: Int = 0,
    val fingerprint: String? = null,
    val expired: Boolean = false,
)

@Serializable
data class BillingSummaryDto(
    val plan: String = "free",
    val label: String = "Free",
    val unlimited: Boolean = false,
    val granted: Int? = 0,
    val used: Int = 0,
    val remaining: Int? = 0,
    val period: BillingPeriodDto? = null,
    @SerialName("base_plan") val basePlan: String = "free",
    val trial: BillingTrialStateDto = BillingTrialStateDto(),
    val license: BillingLicenseStateDto = BillingLicenseStateDto(),
)

@Serializable
data class BillingPlanRequestDto(val plan: String)

@Serializable
data class BillingCheckoutRequestDto(
    val plan: String,
    val interval: String = "monthly",
    @SerialName("return_url") val returnUrl: String? = null,
    val email: String? = null,
)

@Serializable
data class BillingCheckoutResponseDto(
    val reference: String,
    @SerialName("authorization_url") val authorizationUrl: String? = null,
    val plan: String,
    val interval: String,
    val mode: String = "hosted",
)

@Serializable
data class VerifyPaymentRequestDto(val reference: String)

@Serializable
data class BillingPaymentRecordDto(
    val id: Int? = null,
    val reference: String,
    val plan: String,
    val interval: String = "monthly",
    val amount: Double = 0.0,
    val currency: String = "USD",
    val status: String,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("paid_at") val paidAt: String? = null,
)

@Serializable
data class BillingPaymentsListDto(
    val items: List<BillingPaymentRecordDto> = emptyList(),
)

@Serializable
data class PaymentConfigDto(
    val enabled: Boolean = false,
    val provider: String = "paystack",
    val currency: String = "USD",
    val verification: Boolean = false,
)

@Serializable
data class LicenseActivateRequestDto(val key: String)

@Serializable
data class LicenseStatusResponseDto(
    val license: BillingLicenseStateDto = BillingLicenseStateDto(),
    @SerialName("effective_plan") val effectivePlan: String = "free",
)

@Serializable
data class FeedbackStatusDto(
    val due: Boolean = false,
    val required: Boolean = false,
    @SerialName("due_at") val dueAt: String? = null,
    @SerialName("interval_days") val intervalDays: Int = 21,
    @SerialName("submitted_before") val submittedBefore: Boolean = false,
)

@Serializable
data class FeedbackSubmitDto(
    val rating: Int? = null,
    val overall: String? = null,
    val likes: String? = null,
    val issues: String? = null,
    val improvements: String? = null,
)

@Serializable
data class FeedbackOutDto(
    val id: Int,
    val rating: Int? = null,
    val overall: String? = null,
    val likes: String? = null,
    val issues: String? = null,
    val improvements: String? = null,
    @SerialName("submitted_by") val submittedBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class IssueReportInDto(
    val category: String = "other",
    val severity: String = "normal",
    val subject: String,
    val description: String,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("app_version") val appVersion: String? = null,
    val platform: String = "android",
)

@Serializable
data class IssueReportOutDto(
    val id: Int,
    val category: String = "other",
    val severity: String = "normal",
    val subject: String,
    val description: String,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("app_version") val appVersion: String? = null,
    val platform: String? = null,
    val status: String = "new",
    @SerialName("submitted_by") val submittedBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class DailySummaryDto(
    val date: String,
    @SerialName("business_name") val businessName: String = "",
    val currency: String = "USD",
    @SerialName("orders_today") val ordersToday: Int = 0,
    @SerialName("revenue_today") val revenueToday: Double = 0.0,
    @SerialName("low_stock_count") val lowStockCount: Int = 0,
    @SerialName("out_of_stock_count") val outOfStockCount: Int = 0,
    @SerialName("unpaid_orders_count") val unpaidOrdersCount: Int = 0,
    @SerialName("outstanding_amount") val outstandingAmount: Double = 0.0,
    val highlights: List<String> = emptyList(),
)

@Serializable
data class SyncPullCustomerDto(
    val id: Int,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("full_name") val fullName: String,
    val email: String,
    val phone: String? = null,
    val address: String? = null,
    val company: String? = null,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class SyncPullProductDto(
    val id: Int,
    @SerialName("client_id") val clientId: String? = null,
    val sku: String,
    val name: String,
    val description: String? = null,
    val category: String? = null,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("cost_price") val costPrice: Double? = null,
    @SerialName("current_stock") val currentStock: Int = 0,
    @SerialName("reorder_level") val reorderLevel: Int = 5,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class SyncPullOrderDto(
    val id: Int,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("customer_id") val customerId: Int,
    val status: String,
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("order_date") val orderDate: String? = null,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class SyncPullOrderItemDto(
    val id: Int,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("order_id") val orderId: Int,
    @SerialName("product_id") val productId: Int,
    val quantity: Int,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("total_price") val totalPrice: Double,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class SyncPullMovementDto(
    val id: Int,
    @SerialName("client_id") val clientId: String? = null,
    @SerialName("product_id") val productId: Int,
    val change: Int,
    val reason: String,
    val note: String? = null,
    @SerialName("order_id") val orderId: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class SyncPullResponseDto(
    val cursor: String? = null,
    @SerialName("full_dump") val fullDump: Boolean = false,
    val customers: List<SyncPullCustomerDto> = emptyList(),
    val products: List<SyncPullProductDto> = emptyList(),
    val orders: List<SyncPullOrderDto> = emptyList(),
    @SerialName("order_items") val orderItems: List<SyncPullOrderItemDto> = emptyList(),
    @SerialName("stock_movements") val stockMovements: List<SyncPullMovementDto> = emptyList(),
)

@Serializable
data class SyncPushOperationDto(
    val entity: String,
    @SerialName("client_id") val clientId: String,
    val operation: String,
    val payload: JsonObject,
    @SerialName("operation_id") val operationId: String? = null,
)

@Serializable
data class SyncPushRequestDto(
    val operations: List<SyncPushOperationDto>,
)

@Serializable
data class SyncConflictDto(
    @SerialName("operation_id") val operationId: String? = null,
    val entity: String,
    @SerialName("client_id") val clientId: String? = null,
    val reason: String,
    val message: String? = null,
    val local: JsonObject = JsonObject(emptyMap()),
    val server: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class SyncPushResponseDto(
    val applied: Int = 0,
    val skipped: Int = 0,
    @SerialName("id_map") val idMap: Map<String, Int> = emptyMap(),
    val errors: List<JsonElement> = emptyList(),
    val conflicts: List<SyncConflictDto> = emptyList(),
)

@Serializable
data class PlatformMeDto(
    @SerialName("is_admin") val isAdmin: Boolean = false,
    val email: String? = null,
    @SerialName("user_id") val userId: String? = null,
)

@Serializable
data class PlatformOverviewDto(
    val businesses: Int = 0,
    val members: Int = 0,
    @SerialName("feedback_responses") val feedbackResponses: Int = 0,
    @SerialName("licenses_total") val licensesTotal: Int = 0,
    @SerialName("licenses_active") val licensesActive: Int = 0,
    @SerialName("payments_success") val paymentsSuccess: Int = 0,
    @SerialName("payments_pending") val paymentsPending: Int = 0,
)

@Serializable
data class PlatformInvestorBusinessesDto(
    val total: Int = 0,
    @SerialName("new_last_7_days") val newLast7Days: Int = 0,
    @SerialName("new_previous_7_days") val newPrevious7Days: Int = 0,
    @SerialName("signup_growth_pct_week_over_week") val signupGrowthPct: Double? = null,
)

@Serializable
data class PlatformInvestorActivationDto(
    @SerialName("eligible_businesses") val eligibleBusinesses: Int = 0,
    val activated: Int = 0,
    @SerialName("rate_pct") val ratePct: Double? = null,
    val definition: String = "",
)

@Serializable
data class PlatformInvestorEngagementDto(
    @SerialName("active_last_7_days") val activeLast7Days: Int = 0,
    @SerialName("active_previous_7_days") val activePrevious7Days: Int = 0,
    @SerialName("week_over_week_retention_pct") val retentionPct: Double? = null,
    val definition: String = "",
)

@Serializable
data class PlatformInvestorRevenueDto(
    val currency: JsonElement? = null,
    val mrr: Double = 0.0,
    @SerialName("previous_window_mrr") val previousWindowMrr: Double = 0.0,
    @SerialName("mrr_growth_pct") val mrrGrowthPct: Double? = null,
    @SerialName("paying_businesses") val payingBusinesses: Int = 0,
    val arpu: Double? = null,
    val definition: String = "",
)

@Serializable
data class PlatformInvestorAiDto(
    @SerialName("credits_used") val creditsUsed: Int = 0,
    val requests: Int = 0,
    @SerialName("credits_per_paying_business") val creditsPerPayingBusiness: Double? = null,
    val definition: String = "",
)

@Serializable
data class PlatformInvestorMetricsDto(
    @SerialName("as_of") val asOf: String? = null,
    @SerialName("window_days") val windowDays: Int = 28,
    val headline: String = "",
    val businesses: PlatformInvestorBusinessesDto = PlatformInvestorBusinessesDto(),
    val activation: PlatformInvestorActivationDto = PlatformInvestorActivationDto(),
    val engagement: PlatformInvestorEngagementDto = PlatformInvestorEngagementDto(),
    val revenue: PlatformInvestorRevenueDto = PlatformInvestorRevenueDto(),
    val ai: PlatformInvestorAiDto = PlatformInvestorAiDto(),
)

@Serializable
data class PlatformFeedbackItemDto(
    val id: Int,
    @SerialName("business_id") val businessId: Int? = null,
    @SerialName("business_name") val businessName: String? = null,
    val rating: Int? = null,
    val overall: String? = null,
    val likes: String? = null,
    val issues: String? = null,
    val improvements: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class PlatformFeedbackResponseDto(
    val items: List<PlatformFeedbackItemDto> = emptyList(),
)

@Serializable
data class PlatformBusinessItemDto(
    val id: Int,
    val name: String,
    @SerialName("owner_email") val ownerEmail: String? = null,
    val currency: String? = null,
    val plan: String = "free",
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class PlatformBusinessesResponseDto(
    val items: List<PlatformBusinessItemDto> = emptyList(),
)

@Serializable
data class PlatformLicenseItemDto(
    val id: Int,
    @SerialName("business_id") val businessId: Int? = null,
    @SerialName("business_name") val businessName: String? = null,
    val fingerprint: String = "",
    val plan: String = "free",
    val seats: Int = 0,
    @SerialName("issued_at") val issuedAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("revoked_at") val revokedAt: String? = null,
)

@Serializable
data class PlatformLicensesResponseDto(
    val items: List<PlatformLicenseItemDto> = emptyList(),
)

@Serializable
data class AdminGenerateLicenseRequestDto(
    @SerialName("business_id") val businessId: Int,
    val plan: String,
    val days: Int? = 365,
    val seats: Int = 1,
)

@Serializable
data class AdminIssuedLicenseDto(
    val key: String = "",
    val fingerprint: String = "",
    @SerialName("business_id") val businessId: Int = 0,
    val plan: String = "",
    val seats: Int = 1,
    @SerialName("issued_at") val issuedAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
)

@Serializable
data class AdminRevokeLicenseRequestDto(
    val fingerprint: String? = null,
    @SerialName("license_key") val licenseKey: String? = null,
    val reason: String? = null,
)

@Serializable
data class AdminRevokeLicenseResponseDto(
    val revoked: Boolean = false,
    val fingerprint: String = "",
    @SerialName("business_id") val businessId: Int = 0,
    val plan: String = "",
    @SerialName("revoked_at") val revokedAt: String? = null,
    val reason: String? = null,
)
