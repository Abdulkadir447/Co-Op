package com.coop.android.data.repository

import com.coop.android.core.auth.SessionManager
import com.coop.android.core.local.CoopDatabase
import com.coop.android.core.network.CoopApiService
import com.coop.android.core.network.dto.*
import com.coop.android.core.offline.LocalAnalyticsEngine
import com.coop.android.core.sync.SyncEngine
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.LocalDate

class DashboardBriefingRepository(
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val syncEngine: SyncEngine,
    private val session: SessionManager,
) {
    suspend fun getSummary(): Result<DashboardSummaryDto> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getDashboardSummary() }.getOrElse { localSummary() }
        } else {
            localSummary()
        }
    }

    suspend fun getTimeseries(days: Int = 30): Result<List<TimeseriesPointDto>> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getRevenueTimeseries(days) }.getOrElse {
                LocalAnalyticsEngine.computeTimeseries(db.orderDao().getAll(), days)
            }
        } else {
            LocalAnalyticsEngine.computeTimeseries(db.orderDao().getAll(), days)
        }
    }

    suspend fun getInventoryByCategory(): Result<List<CategoryValueDto>> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getInventoryByCategory() }.getOrElse {
                LocalAnalyticsEngine.computeInventoryByCategory(db.productDao().getAll())
            }
        } else {
            LocalAnalyticsEngine.computeInventoryByCategory(db.productDao().getAll())
        }
    }

    suspend fun getTopProducts(limit: Int = 5): Result<List<TopProductItemDto>> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getTopProducts(limit) }.getOrElse {
                LocalAnalyticsEngine.computeTopProducts(
                    db.productDao().getAll(),
                    db.orderDao().getAll(),
                    db.orderDao().getAllItems(),
                    limit,
                )
            }
        } else {
            LocalAnalyticsEngine.computeTopProducts(
                db.productDao().getAll(),
                db.orderDao().getAll(),
                db.orderDao().getAllItems(),
                limit,
            )
        }
    }

    suspend fun getBriefing(): Result<BriefingResponseDto> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getDashboardBriefing() }.getOrElse { localBriefing() }
        } else {
            localBriefing()
        }
    }

    suspend fun getOnboardingState(): Result<OnboardingStateDto> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            api.getOnboardingState()
        } else {
            val p = db.productDao().getAll().size
            val c = db.customerDao().getAll().size
            val o = db.orderDao().getAll().size
            OnboardingStateDto(hasData = (p + c + o) > 0, products = p, customers = c, orders = o)
        }
    }

    private suspend fun localSummary(): DashboardSummaryDto =
        LocalAnalyticsEngine.computeDashboardSummary(
            products = db.productDao().getAll(),
            customers = db.customerDao().getAll(),
            orders = db.orderDao().getAll(),
            items = db.orderDao().getAllItems(),
        )

    private suspend fun localBriefing(): BriefingResponseDto =
        LocalAnalyticsEngine.computeBriefing(
            products = db.productDao().getAll(),
            customers = db.customerDao().getAll(),
            orders = db.orderDao().getAll(),
            items = db.orderDao().getAllItems(),
            currency = session.state.value.currency,
        )
}

class ReportRepository(
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val syncEngine: SyncEngine,
    private val session: SessionManager,
) {
    suspend fun getMeta(): Result<ReportsMetaDto> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getReportsMeta() }.getOrElse { defaultMeta() }
        } else {
            defaultMeta()
        }
    }

    suspend fun getReport(
        key: String,
        from: String? = null,
        to: String? = null,
        compare: String? = null,
        category: String? = null,
    ): Result<ReportDataDto> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching {
                api.getReport(key = key, from = from, to = to, compare = compare, category = category)
            }.getOrElse {
                localReport(key, from, to, category)
            }
        } else {
            localReport(key, from, to, category)
        }
    }

    suspend fun exportReportBytes(
        key: String,
        format: String,
        from: String? = null,
        to: String? = null,
        compare: String? = null,
        category: String? = null,
    ): Result<ByteArray> = runCatching {
        if (format.equals("csv", ignoreCase = true) && (session.state.value.isDemoMode || !syncEngine.connectivity.isOnline.value)) {
            val report = localReport(key, from, to, category)
            LocalAnalyticsEngine.exportReportCsv(report).toByteArray(Charsets.UTF_8)
        } else {
            val resp = api.exportReport(
                key = key,
                format = format,
                from = from,
                to = to,
                compare = compare,
                category = category,
            )
            resp.body()?.bytes() ?: error("Empty report export")
        }
    }

    private suspend fun localReport(key: String, from: String?, to: String?, category: String?): ReportDataDto {
        val toDate = to?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now()
        val fromDate = from?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: toDate.minusDays(29)
        return LocalAnalyticsEngine.computeReport(
            key = key,
            products = db.productDao().getAll(),
            customers = db.customerDao().getAll(),
            orders = db.orderDao().getAll(),
            items = db.orderDao().getAllItems(),
            from = fromDate,
            to = toDate,
            category = category,
        )
    }

    private suspend fun defaultMeta(): ReportsMetaDto {
        val cats = db.productDao().getAll().mapNotNull { it.category?.takeIf { c -> c.isNotBlank() } }.distinct().sorted()
        return ReportsMetaDto(
            reports = listOf(
                ReportMetaOptionDto("sales", "Sales Performance"),
                ReportMetaOptionDto("profit_loss", "Profit & Loss"),
                ReportMetaOptionDto("inventory", "Inventory Valuation"),
                ReportMetaOptionDto("customers", "Customer Performance"),
            ),
            categories = cats,
            compareOptions = listOf("none", "previous_period", "previous_month", "previous_year"),
        )
    }
}

class ImportRepository(
    private val api: CoopApiService,
) {
    suspend fun preview(filename: String, bytes: ByteArray): Result<ImportPreviewDto> = runCatching {
        val part = MultipartBody.Part.createFormData(
            "file",
            filename,
            bytes.toRequestBody("text/csv".toMediaType()),
        )
        api.importPreview(part)
    }

    suspend fun suggestMap(req: ImportMapRequestDto): Result<ImportMapResponseDto> = runCatching {
        api.importMap(req)
    }

    suspend fun validate(
        filename: String,
        bytes: ByteArray,
        entity: String,
        mappingJson: String,
    ): Result<ImportValidateResponseDto> = runCatching {
        val part = MultipartBody.Part.createFormData(
            "file",
            filename,
            bytes.toRequestBody("text/csv".toMediaType()),
        )
        api.importValidate(
            file = part,
            entity = entity.toRequestBody("text/plain".toMediaType()),
            mapping = mappingJson.toRequestBody("application/json".toMediaType()),
        )
    }

    suspend fun commit(
        filename: String,
        bytes: ByteArray,
        entity: String,
        mappingJson: String,
    ): Result<ImportCommitResponseDto> = runCatching {
        val part = MultipartBody.Part.createFormData(
            "file",
            filename,
            bytes.toRequestBody("text/csv".toMediaType()),
        )
        api.importCommit(
            file = part,
            entity = entity.toRequestBody("text/plain".toMediaType()),
            mapping = mappingJson.toRequestBody("application/json".toMediaType()),
        )
    }
}

class AiRepository(
    private val api: CoopApiService,
    private val session: SessionManager,
) {
    suspend fun ask(
        question: String,
        history: List<Map<String, String>>? = null,
        reportRef: AiReportRefDto? = null,
    ): Result<AiChatResponseDto> = runCatching {
        if (session.state.value.isDemoMode) {
            AiChatResponseDto(
                type = "answer",
                kind = "suggestion",
                title = "Offline Demo Mode",
                message = "Zeno requires an active backend connection to run verified model queries. Connect to your Co-op server in Settings or sign in with your Clerk session token to ask live questions.",
                basis = AiBasisDto(period = "offline", sources = listOf("local_mirror")),
                followUps = listOf("Show me my monthly revenue", "Which products are low on stock?"),
            )
        } else {
            api.aiChat(AiChatRequestDto(question = question, history = history, report = reportRef))
        }
    }

    suspend fun getUsage(): Result<AiUsageResponseDto> = runCatching {
        if (session.state.value.isDemoMode) AiUsageResponseDto(month = "Demo") else api.getAiUsage()
    }

    suspend fun getForecast(): Result<AiForecastResponseDto> = runCatching {
        if (session.state.value.isDemoMode) {
            AiForecastResponseDto(
                available = false,
                reason = "Connect online to view server-computed multi-month forecasts.",
                currency = session.state.value.currency,
            )
        } else {
            api.getAiForecast()
        }
    }

    suspend fun getHistory(): Result<AiHistoryResponseDto> = runCatching {
        if (session.state.value.isDemoMode) AiHistoryResponseDto() else api.getAiHistory()
    }

    suspend fun clearHistory(): Result<Unit> = runCatching {
        if (!session.state.value.isDemoMode) api.clearAiHistory()
    }

    suspend fun getLessons(): Result<ZenoLessonsResponseDto> = runCatching {
        if (session.state.value.isDemoMode) ZenoLessonsResponseDto() else api.getZenoLessons()
    }

    suspend fun createLesson(statement: String, kind: String = "preference", scope: String = "business"): Result<ZenoLessonItemDto> = runCatching {
        val body = kotlinx.serialization.json.buildJsonObject {
            put("kind", kotlinx.serialization.json.JsonPrimitive(kind))
            put("scope", kotlinx.serialization.json.JsonPrimitive(scope))
            put("statement", kotlinx.serialization.json.JsonPrimitive(statement.trim()))
        }
        api.createZenoLesson(body)
    }

    suspend fun setLessonStatus(lessonId: Int, status: String): Result<ZenoLessonItemDto> = runCatching {
        val body = kotlinx.serialization.json.buildJsonObject {
            put("status", kotlinx.serialization.json.JsonPrimitive(status))
        }
        api.updateZenoLesson(lessonId, body)
    }
}
