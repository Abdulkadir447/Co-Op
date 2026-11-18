package com.coop.android.ui.screens.support

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.FeedbackStatusDto
import com.coop.android.core.network.dto.FeedbackSubmitDto
import com.coop.android.data.repository.FeedbackSupportPlatformRepository
import com.coop.android.ui.components.CoopGhostButton
import com.coop.android.ui.components.CoopPrimaryButton
import com.coop.android.ui.components.CoopTextField
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

@Composable
fun FeedbackPromptDialog(
    status: FeedbackStatusDto,
    repo: FeedbackSupportPlatformRepository,
    onDismissedOrSubmitted: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val required = status.required

    var rating by remember { mutableStateOf(0) }
    var overall by remember { mutableStateOf("") }
    var likes by remember { mutableStateOf("") }
    var issues by remember { mutableStateOf("") }
    var improvements by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!required && !busy) onDismissedOrSubmitted() },
        properties = DialogProperties(
            dismissOnBackPress = !required,
            dismissOnClickOutside = !required,
        ),
        title = {
            Text("How is Co-op working for you?", style = CoopType.sectionHeading)
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = if (required) {
                        "You’ve been using Co-op for a few weeks now — we’d love your honest thoughts. This first check-in is required."
                    } else {
                        "A quick check-in — tell us what’s working and what we should build next. You can skip this one."
                    },
                    style = CoopType.bodyCompact,
                    color = palette.onSurfaceVariant,
                )

                Text("OVERALL RATING", style = CoopType.labelCaps, color = palette.outline)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    (1..5).forEach { star ->
                        IconButton(onClick = { rating = star }) {
                            Icon(
                                imageVector = if (star <= rating) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                contentDescription = "$star stars",
                                tint = palette.warning,
                            )
                        }
                    }
                }

                CoopTextField(
                    value = overall,
                    onValueChange = {
                        overall = it
                        error = null
                    },
                    label = if (required) "Your thoughts *" else "Your thoughts",
                    placeholder = "How is Co-op fitting into your business so far?",
                    singleLine = false,
                )
                CoopTextField(
                    value = likes,
                    onValueChange = { likes = it },
                    label = "What do you like most?",
                    placeholder = "Features or screens that feel right...",
                    singleLine = false,
                )
                CoopTextField(
                    value = issues,
                    onValueChange = { issues = it },
                    label = "Any issues or problems?",
                    placeholder = "Bugs or confusing parts...",
                    singleLine = false,
                )
                CoopTextField(
                    value = improvements,
                    onValueChange = { improvements = it },
                    label = "What would you love us to add?",
                    placeholder = "Improvements you're wishing for...",
                    singleLine = false,
                )

                if (error != null) {
                    Text(error!!, style = CoopType.bodyCompact, color = palette.error)
                }
            }
        },
        confirmButton = {
            CoopPrimaryButton(
                text = if (required) "Submit Feedback" else "Send Feedback",
                loading = busy,
                onClick = {
                    if (required && overall.isBlank()) {
                        error = "Please tell us how you’re finding Co-op — this first check-in is required."
                        return@CoopPrimaryButton
                    }
                    busy = true
                    error = null
                    scope.launch {
                        repo.submitFeedback(
                            FeedbackSubmitDto(
                                rating = rating.takeIf { it > 0 },
                                overall = overall.trim().takeIf { it.isNotBlank() },
                                likes = likes.trim().takeIf { it.isNotBlank() },
                                issues = issues.trim().takeIf { it.isNotBlank() },
                                improvements = improvements.trim().takeIf { it.isNotBlank() },
                            ),
                        ).onSuccess {
                            busy = false
                            onDismissedOrSubmitted()
                        }.onFailure {
                            busy = false
                            error = ApiErrorParser.message(it, "Could not submit feedback")
                        }
                    }
                },
            )
        },
        dismissButton = {
            if (!required) {
                CoopGhostButton(
                    text = "Skip for now",
                    enabled = !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            repo.dismissFeedback()
                            busy = false
                            onDismissedOrSubmitted()
                        }
                    },
                )
            }
        },
    )
}
