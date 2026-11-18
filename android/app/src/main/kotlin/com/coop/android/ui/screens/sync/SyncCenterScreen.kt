package com.coop.android.ui.screens.sync

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.coop.android.core.local.SyncOutboxEntity
import com.coop.android.core.offline.LocalOrderMath
import com.coop.android.core.sync.SyncEngine
import com.coop.android.core.sync.SyncStatusState
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun SyncCenterScreen(
    syncEngine: SyncEngine,
    syncStatus: SyncStatusState,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val queue by syncEngine.activeQueue.collectAsState(initial = emptyList())
    val conflicts = queue.filter { it.status == "conflict" }
    val pending = queue.filter { it.status != "conflict" }
    var feedback by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Sync Center", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                CoopCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text("Local SQLite Mirror", style = CoopType.sectionHeading)
                            Text(
                                text = if (syncStatus.isOnline) "Connected to cloud" else "Offline — queueing locally",
                                style = CoopType.bodyCompact,
                                color = palette.onSurfaceVariant,
                            )
                        }
                        CoopStatusPill(
                            text = if (syncStatus.mirrorReady) "Mirror Ready" else "Not Pulled",
                            tone = if (syncStatus.mirrorReady) PillTone.SUCCESS else PillTone.WARNING,
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Last pull: ${syncStatus.lastPullAt?.take(19) ?: "Never"}", style = CoopType.labelCaps, color = palette.outline)
                    Text("Last push: ${syncStatus.lastPushAt?.take(19) ?: "Never"}", style = CoopType.labelCaps, color = palette.outline)
                    if (syncStatus.lastError != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text("Last error: ${syncStatus.lastError}", style = CoopType.bodyCompact, color = palette.error)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CoopPrimaryButton(
                            text = "Sync Now",
                            leadingIcon = Icons.Rounded.Sync,
                            loading = syncStatus.isSyncing,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                scope.launch {
                                    syncEngine.syncNow()
                                        .onSuccess { feedback = "Sync cycle completed." }
                                        .onFailure { feedback = it.message }
                                }
                            },
                        )
                        CoopSecondaryButton(
                            text = "Full Re-Pull",
                            modifier = Modifier.weight(1f),
                            onClick = {
                                scope.launch {
                                    syncEngine.syncNow(forceFullPull = true)
                                        .onSuccess { feedback = "Full mirror refreshed." }
                                        .onFailure { feedback = it.message }
                                }
                            },
                        )
                    }
                }
            }

            if (feedback != null) {
                item { Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary) }
            }

            item { CoopSectionHeader(title = "Conflicts (${conflicts.size})") }
            if (conflicts.isEmpty()) {
                item {
                    CoopCard(backgroundColor = palette.surfaceContainerLow) {
                        Text(
                            "No conflicts. Any collisions with cloud state appear side-by-side here so nothing is silently overwritten.",
                            style = CoopType.bodyCompact,
                            color = palette.onSurfaceVariant,
                        )
                    }
                }
            } else {
                items(conflicts, key = { it.id }) { c ->
                    ConflictResolutionCard(
                        item = c,
                        onResolveNewValue = { field, value ->
                            scope.launch { syncEngine.resolveConflictWithNewValue(c.id, field, value) }
                        },
                        onKeepCloud = { scope.launch { syncEngine.resolveConflictKeepCloud(c.id) } },
                        onRetry = { scope.launch { syncEngine.resolveConflictRetry(c.id) } },
                        onDiscard = { scope.launch { syncEngine.resolveConflictDiscard(c.id) } },
                    )
                }
            }

            item { CoopSectionHeader(title = "Pending Outbox (${pending.size})") }
            if (pending.isEmpty()) {
                item {
                    CoopEmptyState(
                        title = "Outbox empty",
                        message = "All local writes have been synced to the cloud.",
                        icon = Icons.Rounded.CloudDone,
                    )
                }
            } else {
                items(pending, key = { it.id }) { op ->
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${op.entity.uppercase()} · ${op.operation}", style = CoopType.titleMd)
                            CoopStatusPill(text = op.status, tone = PillTone.WARNING)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("client_id: ${op.clientId}", style = CoopType.labelCaps, color = palette.outline)
                    }
                }
            }
        }
    }
}

@Composable
private fun ConflictResolutionCard(
    item: SyncOutboxEntity,
    onResolveNewValue: (field: String, newValue: String) -> Unit,
    onKeepCloud: () -> Unit,
    onRetry: () -> Unit,
    onDiscard: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    var replacement by remember { mutableStateOf("") }

    CoopCard(
        modifier = Modifier.fillMaxWidth(),
        borderColor = palette.error.copy(alpha = 0.4f),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${item.entity.uppercase()} ${item.operation}", style = CoopType.titleMd, color = palette.error)
            CoopStatusPill(text = item.conflictReason ?: "conflict", tone = PillTone.CRITICAL)
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(item.conflictMessage ?: "Collision with cloud version", style = CoopType.bodyCompact)
        Spacer(modifier = Modifier.height(8.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CoopCard(modifier = Modifier.weight(1f), backgroundColor = palette.surfaceContainerLow, contentPadding = 10.dp) {
                Text("LOCAL", style = CoopType.labelCaps, color = palette.primary)
                Text(item.localSnapshotJson ?: item.payloadJson, style = CoopType.bodyCompact)
            }
            CoopCard(modifier = Modifier.weight(1f), backgroundColor = palette.surfaceContainerLow, contentPadding = 10.dp) {
                Text("CLOUD", style = CoopType.labelCaps, color = palette.outline)
                Text(item.serverSnapshotJson ?: "-", style = CoopType.bodyCompact)
            }
        }

        if (item.conflictReason == "email_conflict" || item.conflictReason == "sku_conflict") {
            val field = if (item.conflictReason == "email_conflict") "email" else "sku"
            Spacer(modifier = Modifier.height(10.dp))
            CoopTextField(
                value = replacement,
                onValueChange = { replacement = it },
                label = "Enter new $field",
            )
            Spacer(modifier = Modifier.height(8.dp))
            CoopPrimaryButton(
                text = "Update $field & Retry",
                enabled = replacement.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                onClick = { onResolveNewValue(field, replacement.trim()) },
            )
        } else if (item.conflictReason == "invalid_transition") {
            val cloudStatus = remember(item.serverSnapshotJson) {
                runCatching {
                    val obj = com.coop.android.core.network.ApiClientFactory.json
                        .decodeFromString(JsonObject.serializer(), item.serverSnapshotJson ?: "{}")
                    obj["status"]?.jsonPrimitive?.content ?: "pending"
                }.getOrDefault("pending")
            }
            val nextOptions = remember(cloudStatus) { LocalOrderMath.allowedNextStatuses(cloudStatus) }
            if (nextOptions.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text("CHOOSE LEGAL NEXT STATUS FROM \"$cloudStatus\"", style = CoopType.labelCaps, color = palette.outline)
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    nextOptions.forEach { next ->
                        CoopPrimaryButton(
                            text = "Set ${next.replaceFirstChar { it.uppercase() }}",
                            onClick = { onResolveNewValue("status", next) },
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CoopSecondaryButton(text = "Keep Cloud", modifier = Modifier.weight(1f), onClick = onKeepCloud)
            CoopSecondaryButton(text = "Retry", modifier = Modifier.weight(1f), onClick = onRetry)
            CoopGhostButton(text = "Discard", textColor = palette.error, onClick = onDiscard)
        }
    }
}
