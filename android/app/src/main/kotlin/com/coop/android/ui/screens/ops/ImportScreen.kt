package com.coop.android.ui.screens.ops

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.data.repository.ImportRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

@Composable
fun ImportScreen(
    repo: ImportRepository,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var fileName by remember { mutableStateOf<String?>(null) }
    var fileBytes by remember { mutableStateOf<ByteArray?>(null) }
    var preview by remember { mutableStateOf<ImportPreviewDto?>(null) }
    var selectedEntity by remember { mutableStateOf("products") }
    var mapping by remember { mutableStateOf<Map<String, String?>>(emptyMap()) }
    var validation by remember { mutableStateOf<ImportValidateResponseDto?>(null) }
    var commitResult by remember { mutableStateOf<ImportCommitResponseDto?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            loading = true
            error = null
            validation = null
            commitResult = null
            runCatching {
                val name = context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (c.moveToFirst() && idx >= 0) c.getString(idx) else "import.csv"
                } ?: "import.csv"
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Could not read file")
                fileName = name
                fileBytes = bytes
                val prev = repo.preview(name, bytes).getOrThrow()
                preview = prev
                selectedEntity = prev.entity
                val mapRes = repo.suggestMap(
                    ImportMapRequestDto(
                        entity = prev.entity,
                        headers = prev.columns,
                        sampleRows = prev.sampleRows,
                    ),
                ).getOrThrow()
                mapping = mapRes.mappings.associate { it.column to it.field }
            }.onFailure { error = ApiErrorParser.message(it, "Could not preview file") }
            loading = false
        }
    }

    fun mappingJsonString(): String {
        val obj = buildJsonObject {
            mapping.forEach { (col, field) ->
                if (field.isNullOrBlank()) put(col, JsonNull) else put(col, JsonPrimitive(field))
            }
        }
        return obj.toString()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Intelligent Import", style = CoopType.titleMd) },
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
                CoopAiCard(title = "CSV / Spreadsheet Import", badgeText = "Idempotent") {
                    Text(
                        text = "Upload products, customers, or historical orders. Co-op validates every row before committing in a single transaction.",
                        style = CoopType.bodyCompact,
                        color = palette.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    CoopPrimaryButton(
                        text = if (fileName == null) "Choose CSV / Excel File" else "Selected: $fileName",
                        leadingIcon = Icons.Rounded.UploadFile,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { filePicker.launch(arrayOf("text/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) },
                    )
                }
            }

            if (loading) {
                item { CoopLoader(label = "Processing import...") }
            }
            if (error != null) {
                item { CoopErrorState(message = error!!) }
            }

            if (preview != null && commitResult == null) {
                val p = preview!!
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(
                            title = "1. Dataset & Column Mapping",
                            subtitle = "${p.rowCount} rows detected · Entity: $selectedEntity",
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("products", "customers", "orders").forEach { ent ->
                                FilterChip(
                                    selected = selectedEntity == ent,
                                    onClick = {
                                        selectedEntity = ent
                                        scope.launch {
                                            repo.suggestMap(ImportMapRequestDto(ent, p.columns, p.sampleRows))
                                                .onSuccess { res -> mapping = res.mappings.associate { it.column to it.field } }
                                        }
                                    },
                                    label = { Text(ent.replaceFirstChar { it.uppercase() }) },
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        mapping.entries.forEach { (col, target) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(col, style = CoopType.bodyCompact, color = palette.onSurface)
                                Text(target ?: "(skip)", style = CoopType.bodyCompact, color = palette.primary)
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        CoopSecondaryButton(
                            text = "Run Validation Dry-Run",
                            leadingIcon = Icons.Rounded.FactCheck,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                val bytes = fileBytes ?: return@CoopSecondaryButton
                                val name = fileName ?: "upload.csv"
                                scope.launch {
                                    loading = true
                                    error = null
                                    repo.validate(name, bytes, selectedEntity, mappingJsonString())
                                        .onSuccess { validation = it }
                                        .onFailure { error = ApiErrorParser.message(it) }
                                    loading = false
                                }
                            },
                        )
                    }
                }
            }

            if (validation != null && commitResult == null) {
                val v = validation!!
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(title = "2. Validation Summary")
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Total rows: ${v.totalRows}", style = CoopType.bodyCompact)
                        Text("Valid rows: ${v.validRows} (would create ${v.wouldCreate})", style = CoopType.bodyCompact, color = palette.success)
                        Text("Duplicates skipped: ${v.duplicates}", style = CoopType.bodyCompact, color = palette.warning)
                        if (v.errors.isNotEmpty()) {
                            Text("Errors: ${v.errors.size}", style = CoopType.bodyCompact, color = palette.error)
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        CoopPrimaryButton(
                            text = "Commit Import",
                            leadingIcon = Icons.Rounded.Check,
                            enabled = v.validRows > 0,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                val bytes = fileBytes ?: return@CoopPrimaryButton
                                val name = fileName ?: "upload.csv"
                                scope.launch {
                                    loading = true
                                    error = null
                                    repo.commit(name, bytes, selectedEntity, mappingJsonString())
                                        .onSuccess { commitResult = it }
                                        .onFailure { error = ApiErrorParser.message(it) }
                                    loading = false
                                }
                            },
                        )
                    }
                }
            }

            if (commitResult != null) {
                val c = commitResult!!
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopStatusPill(text = "Import Complete", tone = PillTone.SUCCESS)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Created ${c.created} records (Batch #${c.batchId ?: "-"}).", style = CoopType.titleMd)
                        Text("Skipped ${c.skipped} duplicates.", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                        Spacer(modifier = Modifier.height(12.dp))
                        CoopPrimaryButton(
                            text = "Done",
                            modifier = Modifier.fillMaxWidth(),
                            onClick = onDone,
                        )
                    }
                }
            }
        }
    }
}
