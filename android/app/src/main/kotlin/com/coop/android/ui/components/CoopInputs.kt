package com.coop.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType

@Composable
fun CoopTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supportingText: String? = null,
    isError: Boolean = false,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else 5,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    val palette = CoopThemeTokens.colors
    Column(modifier = modifier) {
        Text(
            text = label,
            style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
            color = if (isError) palette.error else palette.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            readOnly = readOnly,
            singleLine = singleLine,
            maxLines = maxLines,
            isError = isError,
            placeholder = placeholder?.let { { Text(it, color = palette.outline) } },
            supportingText = supportingText?.let {
                {
                    Text(
                        text = it,
                        style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                        color = if (isError) palette.error else palette.outline,
                    )
                }
            },
            leadingIcon = leadingIcon,
            trailingIcon = trailingIcon,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            visualTransformation = visualTransformation,
            shape = RoundedCornerShape(CoopRadius.lg),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = palette.surfaceContainerLowest,
                unfocusedContainerColor = palette.surfaceContainerLowest,
                disabledContainerColor = palette.surfaceContainerLow,
                focusedBorderColor = palette.primary,
                unfocusedBorderColor = palette.outlineVariant,
                errorBorderColor = palette.error,
                focusedTextColor = palette.onSurface,
                unfocusedTextColor = palette.onSurface,
            ),
        )
    }
}

@Composable
fun CoopSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String = "Search...",
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        placeholder = { Text(placeholder, color = palette.outline, style = CoopType.bodyCompact) },
        leadingIcon = {
            Icon(
                imageVector = Icons.Rounded.Search,
                contentDescription = "Search",
                tint = palette.outline,
            )
        },
        trailingIcon = if (query.isNotEmpty()) {
            {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Clear search",
                        tint = palette.outline,
                    )
                }
            }
        } else null,
        shape = RoundedCornerShape(CoopRadius.lg),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = palette.surfaceContainerLowest,
            unfocusedContainerColor = palette.surfaceContainerLowest,
            focusedBorderColor = palette.primary,
            unfocusedBorderColor = palette.outlineVariant,
        ),
    )
}

@Composable
fun CoopSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    val palette = CoopThemeTokens.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = CoopType.sectionHeading,
                color = palette.onSurface,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = CoopType.bodyCompact,
                    color = palette.onSurfaceVariant,
                )
            }
        }
        if (action != null) {
            action()
        }
    }
}
