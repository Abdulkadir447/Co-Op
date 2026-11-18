package com.coop.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.ui.theme.CoopAiGradient
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType

@Composable
fun CoopPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val palette = CoopThemeTokens.colors
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = 44.dp),
        shape = RoundedCornerShape(CoopRadius.lg),
        colors = ButtonDefaults.buttonColors(
            containerColor = palette.primary,
            contentColor = palette.onPrimary,
            disabledContainerColor = palette.primary.copy(alpha = 0.45f),
            disabledContentColor = palette.onPrimary.copy(alpha = 0.8f),
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
    ) {
        ButtonContent(text = text, loading = loading, leadingIcon = leadingIcon, tint = palette.onPrimary)
    }
}

@Composable
fun CoopSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val palette = CoopThemeTokens.colors
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = 44.dp),
        shape = RoundedCornerShape(CoopRadius.lg),
        border = BorderStroke(1.dp, if (enabled) palette.primary else palette.outlineVariant),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = palette.surfaceContainerLowest,
            contentColor = palette.primary,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
    ) {
        ButtonContent(text = text, loading = loading, leadingIcon = leadingIcon, tint = palette.primary)
    }
}

@Composable
fun CoopGhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
    textColor: Color = CoopThemeTokens.colors.primary,
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 40.dp),
        shape = RoundedCornerShape(CoopRadius.lg),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
    ) {
        ButtonContent(text = text, loading = false, leadingIcon = leadingIcon, tint = textColor)
    }
}

@Composable
fun CoopDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val palette = CoopThemeTokens.colors
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = 44.dp),
        shape = RoundedCornerShape(CoopRadius.lg),
        colors = ButtonDefaults.buttonColors(
            containerColor = palette.error,
            contentColor = palette.onError,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
    ) {
        ButtonContent(text = text, loading = loading, leadingIcon = leadingIcon, tint = palette.onError)
    }
}

@Composable
fun CoopAiButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val shape = RoundedCornerShape(CoopRadius.lg)
    Box(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(CoopAiGradient, alpha = if (enabled) 1f else 0.5f)
            .clickable(enabled = enabled && !loading, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    imageVector = Icons.Rounded.AutoAwesome,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = text,
                style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                color = Color.White,
            )
        }
    }
}

@Composable
private fun ButtonContent(
    text: String,
    loading: Boolean,
    leadingIcon: ImageVector?,
    tint: Color,
) {
    if (loading) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            color = tint,
            strokeWidth = 2.dp,
        )
        Spacer(modifier = Modifier.width(8.dp))
    } else if (leadingIcon != null) {
        Icon(
            imageVector = leadingIcon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
    }
    Text(
        text = text,
        style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
        color = tint,
    )
}
