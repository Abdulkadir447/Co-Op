package com.coop.android.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class DashboardSummaryDto(
    @SerialName("revenue_today") val revenueToday: Double = 0.0,
    @SerialName("orders_today") val ordersToday: Int = 0,
    @SerialName("revenue_month") val revenueMonth: Double = 0.0,
    @SerialName("orders_month") val ordersMonth: Int = 0,
    @SerialName("revenue_growth_percent") val revenueGrowthPercent: Double? = null,
    @SerialName("profit_month") val profitMonth: Double = 0.0,
    @SerialName("products_count") val productsCount: Int = 0,
    @SerialName("inventory_value") val inventoryValue: Double = 0.0,
    @SerialName("low_stock_count") val lowStockCount: Int = 0,
    @SerialName("out_of_stock_count") val outOfStockCount: Int = 0,
    @SerialName("customers_total") val customersTotal: Int = 0,
    @SerialName("customers_new_month") val customersNewMonth: Int = 0,
)

@Serializable
data class TimeseriesPointDto(
    val date: String,
    val revenue: Double,
    val orders: Int,
)

@Serializable
data class CategoryValueDto(
    val category: String,
    val value: Double,
)

@Serializable
data class TopProductItemDto(
    @SerialName("product_id") val productId: Int,
    @SerialName("product_name") val productName: String,
    @SerialName("total_quantity") val totalQuantity: Int,
    @SerialName("total_revenue") val totalRevenue: Double,
)

@Serializable
data class OnboardingStateDto(
    @SerialName("has_data") val hasData: Boolean = false,
    val products: Int = 0,
    val customers: Int = 0,
    val orders: Int = 0,
)

@Serializable
data class BriefingImportInfoDto(
    val filename: String,
    val date: String? = null,
    val rows: Int = 0,
)

@Serializable
data class BriefingActionDto(
    val type: String,
    val label: String? = null,
    @SerialName("customer_id") val customerId: Int? = null,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("product_id") val productId: Int? = null,
    @SerialName("product_name") val productName: String? = null,
    val quantity: Int? = null,
)

@Serializable
data class BriefingInsightDto(
    val id: String,
    val kind: String,
    val severity: String,
    val title: String,
    val body: String,
    val evidence: String = "",
    val link: String = "",
    val action: BriefingActionDto? = null,
)

@Serializable
data class BriefingResponseDto(
    @SerialName("as_of") val asOf: String? = null,
    val insights: List<BriefingInsightDto> = emptyList(),
    @SerialName("latest_import") val latestImport: BriefingImportInfoDto? = null,
)

@Serializable
data class ReportMetaOptionDto(
    val key: String,
    val title: String,
)

@Serializable
data class ReportsMetaDto(
    val reports: List<ReportMetaOptionDto> = emptyList(),
    val categories: List<String> = emptyList(),
    @SerialName("compare_options") val compareOptions: List<String> = emptyList(),
)

@Serializable
data class ReportKpiDto(
    val key: String,
    val label: String,
    val value: JsonElement,
    val format: String = "number",
    val previous: Double? = null,
    @SerialName("change_percent") val changePercent: Double? = null,
    @SerialName("good_when") val goodWhen: String = "up",
)

@Serializable
data class ReportSeriesDto(
    val name: String,
    val data: List<Double> = emptyList(),
)

@Serializable
data class ReportChartDto(
    val kind: String = "line",
    val labels: List<String> = emptyList(),
    val series: List<ReportSeriesDto> = emptyList(),
    val money: Boolean = false,
)

@Serializable
data class ReportTableDto(
    val title: String,
    val columns: List<String> = emptyList(),
    val rows: List<List<JsonElement>> = emptyList(),
    @SerialName("numeric_cols") val numericCols: List<Int> = emptyList(),
)

@Serializable
data class ReportDataDto(
    val key: String,
    val title: String,
    @SerialName("period_label") val periodLabel: String,
    val compare: String = "none",
    val filters: Map<String, JsonElement> = emptyMap(),
    @SerialName("generated_at") val generatedAt: String = "",
    val kpis: List<ReportKpiDto> = emptyList(),
    val chart: ReportChartDto = ReportChartDto(),
    val tables: List<ReportTableDto> = emptyList(),
    val notes: List<String> = emptyList(),
)

@Serializable
data class ImportPreviewDto(
    val filename: String,
    val fmt: String,
    @SerialName("row_count") val rowCount: Int,
    val columns: List<String> = emptyList(),
    @SerialName("sample_rows") val sampleRows: List<List<JsonElement>> = emptyList(),
    val entity: String,
    @SerialName("entity_confidence") val entityConfidence: Double = 0.0,
)

@Serializable
data class ImportMapRequestDto(
    val entity: String,
    val headers: List<String>,
    @SerialName("sample_rows") val sampleRows: List<List<JsonElement>> = emptyList(),
)

@Serializable
data class ImportMappingSuggestionDto(
    val column: String,
    val field: String? = null,
    val confidence: Double = 0.0,
    val label: String? = null,
    val hints: List<String> = emptyList(),
)

@Serializable
data class ImportMapResponseDto(
    val entity: String,
    val mappings: List<ImportMappingSuggestionDto> = emptyList(),
)

@Serializable
data class ImportValidateResponseDto(
    val entity: String,
    @SerialName("total_rows") val totalRows: Int = 0,
    @SerialName("valid_rows") val validRows: Int = 0,
    val duplicates: Int = 0,
    @SerialName("unknown_refs") val unknownRefs: Int = 0,
    @SerialName("would_create") val wouldCreate: Int = 0,
    val errors: List<JsonElement> = emptyList(),
    val ambiguous: List<JsonElement> = emptyList(),
)

@Serializable
data class ImportCommitResponseDto(
    @SerialName("batch_id") val batchId: Int? = null,
    @SerialName("total_rows") val totalRows: Int = 0,
    val created: Int = 0,
    val skipped: Int = 0,
    val errors: List<JsonElement> = emptyList(),
    val warnings: List<String> = emptyList(),
)
