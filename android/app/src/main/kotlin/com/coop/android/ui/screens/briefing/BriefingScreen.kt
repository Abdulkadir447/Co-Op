package com.coop.android.ui.screens.briefing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.BriefingActionDto
import com.coop.android.core.network.dto.BriefingResponseDto
import com.coop.android.data.repository.DashboardBriefingRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

@Composable
fun BriefingScreen(
    repo: DashboardBriefingRepository,
    onDraftFollowUp: (BriefingActionDto) -> Unit,
    onNavigateLink: (String) -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var data by remember { mutableStateOf<BriefingResponseDto?>(null) }

    fun load() {
        scope.launch {
            loading = true
            error = null
            repo.getBriefing()
                .onSuccess { data = it }
                .onFailure { error = ApiErrorParser.message(it, "Unable to build briefing") }
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Day 1 Morning Briefing", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                IconButton(onClick = { load() }) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Refresh")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loading) {
                item { CoopLoader(label = "Analyzing verified business records...") }
            } else if (error != null) {
                item { CoopErrorState(message = error!!, onRetry = { load() }) }
            } else if (data != null) {
                val b = data!!
                if (b.latestImport != null) {
                    item {
                        CoopCard(backgroundColor = palette.surfaceContainerLow) {
                            Text(
                                text = "IMPORT PROVENANCE",
                                style = CoopType.labelCaps,
                                color = palette.primary,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Insights include ${b.latestImport.rows} rows imported from ${b.latestImport.filename} (${b.latestImport.date ?: "recent"}).",
                                style = CoopType.bodyCompact,
                                color = palette.onSurfaceVariant,
                            )
                        }
                    }
                }

                if (b.insights.isEmpty()) {
                    item {
                        CoopEmptyState(
                            title = "No briefing signals yet",
                            message = "Record orders or import your history to unlock deterministic trend, margin, and customer insights.",
                        )
                    }
                } else {
                    items(b.insights, key = { it.id }) { insight ->
                        val tone = when (insight.severity.lowercase()) {
                            "critical" -> PillTone.CRITICAL
                            "warning" -> PillTone.WARNING
                            else -> PillTone.INFO
                        }
                        CoopAiCard(
                            title = insight.title,
                            badgeText = insight.kind.uppercase(),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CoopStatusPill(text = insight.severity, tone = tone)
                                if (insight.link.isNotBlank()) {
                                    CoopGhostButton(
                                        text = "Inspect",
                                        onClick = { onNavigateLink(insight.link) },
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = insight.body,
                                style = CoopType.bodyCompact,
                                color = palette.onSurface,
                            )
                            if (insight.evidence.isNotBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Evidence: ${insight.evidence}",
                                    style = CoopType.labelCaps.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Normal),
                                    color = palette.outline,
                                )
                            }
                            if (insight.action != null) {
                                Spacer(modifier = Modifier.height(12.dp))
                                CoopPrimaryButton(
                                    text = insight.action.label ?: "Draft Follow-up",
                                    leadingIcon = Icons.Rounded.AddShoppingCart,
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = { onDraftFollowUp(insight.action) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
