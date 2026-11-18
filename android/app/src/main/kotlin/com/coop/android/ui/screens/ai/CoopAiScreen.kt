package com.coop.android.ui.screens.ai

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.AiRepository
import com.coop.android.data.repository.BillingLicenseRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.tint
import kotlinx.coroutines.launch
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class ChatTurn(
    val id: String,
    val question: String,
    val response: AiChatResponseDto?,
    val error: String? = null,
)

enum class AiTab(val label: String) {
    CHAT("Ask Zeno"),
    FORECAST("Forecast"),
    HISTORY("History"),
    LESSONS("Lessons"),
}

@Composable
fun CoopAiScreen(
    aiRepo: AiRepository,
    billingRepo: BillingLicenseRepository,
    currency: String,
    pendingReportContext: Pair<String, AiReportRefDto>? = null,
    onConsumedReportContext: () -> Unit = {},
    onDraftOrder: (customerId: Int?, productId: Int?, quantity: Int?) -> Unit,
    onOpenBilling: () -> Unit,
    onNavigateLink: (String) -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()

    var activeTab by remember { mutableStateOf(AiTab.CHAT) }
    var prompt by remember { mutableStateOf("") }
    var asking by remember { mutableStateOf(false) }
    var turns by remember { mutableStateOf<List<ChatTurn>>(emptyList()) }
    var billing by remember { mutableStateOf<BillingSummaryDto?>(null) }
    var forecast by remember { mutableStateOf<AiForecastResponseDto?>(null) }
    var history by remember { mutableStateOf<List<AiHistoryItemDto>>(emptyList()) }
    var lessons by remember { mutableStateOf<List<ZenoLessonItemDto>>(emptyList()) }
    var loadingSubTab by remember { mutableStateOf(false) }

    fun loadCredits() {
        scope.launch {
            billingRepo.getBillingSummary().onSuccess { billing = it }
        }
    }

    fun loadForecast() {
        scope.launch {
            loadingSubTab = true
            aiRepo.getForecast().onSuccess { forecast = it }
            loadingSubTab = false
        }
    }

    fun loadHistory() {
        scope.launch {
            loadingSubTab = true
            aiRepo.getHistory().onSuccess { history = it.items }
            loadingSubTab = false
        }
    }

    fun loadLessons() {
        scope.launch {
            loadingSubTab = true
            aiRepo.getLessons().onSuccess { lessons = it.items }
            loadingSubTab = false
        }
    }

    fun submitQuestion(q: String, reportRef: AiReportRefDto? = null) {
        val clean = q.trim()
        if (clean.isBlank() || asking) return
        prompt = ""
        asking = true
        val historyPayload = turns.takeLast(4).flatMap { t ->
            buildList {
                add(mapOf("role" to "user", "content" to t.question))
                t.response?.let { add(mapOf("role" to "assistant", "content" to it.message)) }
            }
        }
        scope.launch {
            val res = aiRepo.ask(
                question = clean,
                history = historyPayload.takeIf { it.isNotEmpty() },
                reportRef = reportRef,
            )
            val turn = res.fold(
                onSuccess = { ChatTurn(id = "${System.currentTimeMillis()}", question = clean, response = it) },
                onFailure = {
                    ChatTurn(
                        id = "${System.currentTimeMillis()}",
                        question = clean,
                        response = null,
                        error = ApiErrorParser.message(it, "Zeno could not answer right now."),
                    )
                },
            )
            turns = turns + turn
            asking = false
            loadCredits()
        }
    }

    LaunchedEffect(Unit) { loadCredits() }
    LaunchedEffect(pendingReportContext) {
        val ctx = pendingReportContext ?: return@LaunchedEffect
        activeTab = AiTab.CHAT
        submitQuestion(
            "Explain the ${ctx.first}: what changed, what matters most, and what should I investigate?",
            reportRef = ctx.second,
        )
        onConsumedReportContext()
    }
    LaunchedEffect(activeTab) {
        when (activeTab) {
            AiTab.FORECAST -> loadForecast()
            AiTab.HISTORY -> loadHistory()
            AiTab.LESSONS -> loadLessons()
            AiTab.CHAT -> Unit
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        // Header + Credits bar
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.surfaceContainerLowest)
                .padding(horizontal = CoopSpacing.md, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = palette.secondary)
                    Text("Zeno AI Advisor", style = CoopType.pageTitleMobile, color = palette.onSurface)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (turns.isNotEmpty() && activeTab == AiTab.CHAT) {
                        IconButton(onClick = { turns = emptyList() }) {
                            Icon(Icons.Rounded.AddComment, contentDescription = "New Conversation", tint = palette.primary)
                        }
                    }
                    if (billing != null) {
                        val b = billing!!
                        val label = if (b.unlimited) "Unlimited" else "${b.remaining ?: 0} credits"
                        CoopStatusPill(
                            text = label,
                            tone = if (!b.unlimited && (b.remaining ?: 0) <= 0) PillTone.CRITICAL else PillTone.AI,
                        )
                    }
                }
            }

            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                AiTab.entries.forEachIndexed { idx, tab ->
                    SegmentedButton(
                        selected = activeTab == tab,
                        onClick = { activeTab = tab },
                        shape = SegmentedButtonDefaults.itemShape(index = idx, count = AiTab.entries.size),
                        label = { Text(tab.label) },
                    )
                }
            }
        }
        HorizontalDivider(color = palette.borderSubtle)

        when (activeTab) {
            AiTab.CHAT -> {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(CoopSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (turns.isEmpty()) {
                        item {
                            CoopAiCard(title = "Verified Business Intelligence", badgeText = "Read-Only Grounded") {
                                Text(
                                    text = "Ask Zeno about sales, stock risk, customer trends, or request a draft order. Zeno only reads verified business data and never modifies records without your confirmation.",
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Text("SUGGESTED QUESTIONS", style = CoopType.labelCaps, color = palette.outline)
                                Spacer(modifier = Modifier.height(8.dp))
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    listOf(
                                        "How is my revenue trending this month?",
                                        "Which products are low or out of stock?",
                                        "Who are my top customers by spend?",
                                        "Draft a restock order for my best seller",
                                    ).forEach { suggestion ->
                                        SuggestionChip(
                                            onClick = { submitQuestion(suggestion) },
                                            label = { Text(suggestion) },
                                        )
                                    }
                                }
                            }
                        }
                    }

                    items(turns, key = { it.id }) { turn ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            // User question bubble
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(CoopRadius.lg))
                                    .background(palette.primary.tint(0.10f))
                                    .padding(12.dp),
                            ) {
                                Text(
                                    text = turn.question,
                                    style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                    color = palette.onSurface,
                                )
                            }

                            if (turn.error != null) {
                                CoopErrorState(message = turn.error)
                                if (turn.error.contains("credit", ignoreCase = true)) {
                                    CoopSecondaryButton(
                                        text = "Manage Plan & Credits",
                                        onClick = onOpenBilling,
                                    )
                                }
                            } else if (turn.response != null) {
                                val r = turn.response
                                CoopAiCard(
                                    title = r.title.ifBlank { "Zeno" },
                                    badgeText = r.kind.uppercase(),
                                ) {
                                    Text(text = r.message, style = CoopType.bodyCompact, color = palette.onSurface)

                                    if (r.basis.sources.isNotEmpty() || !r.basis.period.isNullOrBlank()) {
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Text(
                                            text = "Basis: ${r.basis.period ?: "current"} · ${r.basis.sources.joinToString(", ")}",
                                            style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                            color = palette.outline,
                                        )
                                    }

                                    // Draft order action confirmation cards
                                    r.actions.filter { it.type == "DRAFT_ORDER" }.forEach { action ->
                                        Spacer(modifier = Modifier.height(10.dp))
                                        val custId = action.parameters["customer_id"]?.jsonPrimitive?.intOrNull
                                        val itemsArr = runCatching { action.parameters["items"]?.jsonArray }.getOrNull()
                                        val firstItem = itemsArr?.firstOrNull()?.jsonObject
                                        val prodId = firstItem?.get("product_id")?.jsonPrimitive?.intOrNull
                                        val qty = firstItem?.get("quantity")?.jsonPrimitive?.intOrNull ?: 1

                                        CoopPrimaryButton(
                                            text = "Review Draft Order",
                                            leadingIcon = Icons.Rounded.AddShoppingCart,
                                            modifier = Modifier.fillMaxWidth(),
                                            onClick = { onDraftOrder(custId, prodId, qty) },
                                        )
                                    }

                                    if (r.links.isNotEmpty()) {
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Row(
                                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            r.links.forEach { link ->
                                                AssistChip(
                                                    onClick = { onNavigateLink(link.to) },
                                                    label = { Text(link.label) },
                                                )
                                            }
                                        }
                                    }

                                    if (r.followUps.isNotEmpty()) {
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Row(
                                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            r.followUps.forEach { fu ->
                                                SuggestionChip(
                                                    onClick = { submitQuestion(fu) },
                                                    label = { Text(fu) },
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (asking) {
                        item { CoopLoader(label = "Zeno is verifying your data...") }
                    }
                }

                // Composer
                Surface(color = palette.surfaceContainerLowest) {
                    Column {
                        HorizontalDivider(color = palette.borderSubtle)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedTextField(
                                value = prompt,
                                onValueChange = { prompt = it },
                                modifier = Modifier.weight(1f),
                                placeholder = { Text("Ask about sales, stock, orders...") },
                                singleLine = true,
                                shape = RoundedCornerShape(CoopRadius.lg),
                            )
                            IconButton(
                                onClick = { submitQuestion(prompt) },
                                enabled = prompt.isNotBlank() && !asking,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Send,
                                    contentDescription = "Ask Zeno",
                                    tint = if (prompt.isNotBlank()) palette.primary else palette.outline,
                                )
                            }
                        }
                    }
                }
            }

            AiTab.FORECAST -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(CoopSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (loadingSubTab) {
                        item { CoopLoader(label = "Computing trend forecast...") }
                    } else if (forecast == null || !forecast!!.available) {
                        item {
                            CoopAiCard(title = "Deterministic Revenue Forecast", badgeText = "Estimate") {
                                Text(
                                    text = forecast?.reason ?: "Need at least 3 completed months of sales history to fit a least-squares trend line.",
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                            }
                        }
                    } else {
                        val f = forecast!!
                        val est = f.forecast!!
                        item {
                            CoopAiCard(title = "${est.periodLabel} Revenue Estimate", badgeText = "Least-Squares") {
                                Text(
                                    text = MoneyFormatter.format(est.estimated, f.currency),
                                    style = CoopType.pageTitle,
                                    color = palette.primary,
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = "Range: ${MoneyFormatter.format(est.low, f.currency)} – ${MoneyFormatter.format(est.high, f.currency)}",
                                    style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                    color = palette.onSurface,
                                )
                                est.trendPercent?.let {
                                    Text(
                                        text = "Trend vs last month: ${if (it >= 0) "+" else ""}$it%",
                                        style = CoopType.bodyCompact,
                                        color = if (it >= 0) palette.success else palette.warning,
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(text = f.method, style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                            }
                        }

                        if (f.months.isNotEmpty()) {
                            item {
                                CoopCard(modifier = Modifier.fillMaxWidth()) {
                                    CoopSectionHeader(title = "Monthly Sales History")
                                    Spacer(modifier = Modifier.height(12.dp))
                                    val maxVal = f.months.maxOf { it.revenue }.coerceAtLeast(1.0)
                                    Canvas(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(140.dp),
                                    ) {
                                        val barW = size.width / (f.months.size * 1.6f).coerceAtLeast(1f)
                                        val step = size.width / f.months.size.coerceAtLeast(1)
                                        f.months.forEachIndexed { idx, m ->
                                            val bh = ((m.revenue / maxVal).toFloat() * size.height * 0.85f).coerceAtLeast(4.dp.toPx())
                                            drawRoundRect(
                                                color = if (m.inProgress) palette.secondaryContainer else palette.primary,
                                                topLeft = Offset(idx * step + (step - barW) / 2f, size.height - bh),
                                                size = Size(barW, bh),
                                                cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            AiTab.HISTORY -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(CoopSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (history.isNotEmpty()) {
                        item {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                CoopDangerButton(
                                    text = "Clear History",
                                    leadingIcon = Icons.Rounded.DeleteSweep,
                                    onClick = {
                                        scope.launch {
                                            aiRepo.clearHistory().onSuccess { history = emptyList() }
                                        }
                                    },
                                )
                            }
                        }
                    }
                    if (loadingSubTab) {
                        item { CoopLoader() }
                    } else if (history.isEmpty()) {
                        item {
                            CoopEmptyState(
                                title = "No AI history yet",
                                message = "Completed Zeno questions are logged here for owner visibility.",
                                icon = Icons.Rounded.History,
                            )
                        }
                    } else {
                        items(history, key = { it.id }) { item ->
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    CoopStatusPill(text = item.answerKind ?: "fact", tone = PillTone.AI)
                                    Text(
                                        text = "${item.creditsUsed} credits",
                                        style = CoopType.labelCaps,
                                        color = palette.outline,
                                    )
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(item.question, style = CoopType.titleMd, color = palette.onSurface)
                                item.answerSummary?.let {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(it, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }

            AiTab.LESSONS -> {
                var newLessonText by remember { mutableStateOf("") }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(CoopSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(
                                title = "Teach Zeno a Preference",
                                subtitle = "Active rules guide future answers",
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            CoopTextField(
                                value = newLessonText,
                                onValueChange = { newLessonText = it },
                                label = "Preference or rule",
                                placeholder = "e.g. Always mention reorder quantities in packs of 12",
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            CoopPrimaryButton(
                                text = "Save Lesson",
                                enabled = newLessonText.trim().length >= 5,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    scope.launch {
                                        aiRepo.createLesson(newLessonText)
                                            .onSuccess { created ->
                                                newLessonText = ""
                                                lessons = listOf(created) + lessons
                                            }
                                    }
                                },
                            )
                        }
                    }
                    if (loadingSubTab) {
                        item { CoopLoader() }
                    } else if (lessons.isEmpty()) {
                        item {
                            CoopEmptyState(
                                title = "No learned preferences yet",
                                message = "When you guide Zeno or reject drafts, Zeno records active lessons here.",
                                icon = Icons.Rounded.School,
                            )
                        }
                    } else {
                        items(lessons, key = { it.id }) { lesson ->
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    CoopStatusPill(
                                        text = "${lesson.kind} · ${lesson.status}",
                                        tone = if (lesson.status == "active") PillTone.SUCCESS else PillTone.INFO,
                                    )
                                    Text(
                                        text = lesson.severityLabel ?: "Severity ${lesson.severity}",
                                        style = CoopType.labelCaps,
                                        color = palette.outline,
                                    )
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(lesson.statement, style = CoopType.bodyCompact, color = palette.onSurface)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = "Scope: ${lesson.scope} · Repeats: ${lesson.repeatCount}",
                                        style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                        color = palette.outline,
                                    )
                                    CoopGhostButton(
                                        text = if (lesson.status == "active") "Dismiss" else "Reactivate",
                                        onClick = {
                                            val next = if (lesson.status == "active") "dismissed" else "active"
                                            scope.launch {
                                                aiRepo.setLessonStatus(lesson.id, next)
                                                    .onSuccess { updated ->
                                                        lessons = lessons.map { if (it.id == updated.id) updated else it }
                                                    }
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
