package com.coop.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.tint

enum class PillTone {
    SUCCESS,
    WARNING,
    CRITICAL,
    INFO,
    NEUTRAL,
    AI,
}

@Composable
fun CoopStatusPill(
    text: String,
    tone: PillTone = PillTone.NEUTRAL,
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    val alpha = if (palette.isDark) 0.18f else 0.11f
    val (bg, fg) = when (tone) {
        PillTone.SUCCESS -> palette.success.tint(alpha) to palette.success
        PillTone.WARNING -> palette.warning.tint(alpha) to palette.warning
        PillTone.CRITICAL -> palette.error.tint(alpha) to palette.error
        PillTone.INFO -> palette.info.tint(alpha) to palette.info
        PillTone.AI -> palette.secondary.tint(alpha) to palette.secondary
        PillTone.NEUTRAL -> palette.surfaceContainerHigh to palette.onSurfaceVariant
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(CoopRadius.full))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = text.uppercase(),
            color = fg,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
            maxLines = 1,
        )
    }
}

fun orderStatusTone(status: String): PillTone = when (status.lowercase()) {
    "delivered", "paid", "sent", "active", "synced", "resolved" -> PillTone.SUCCESS
    "pending", "draft", "pending_sync", "trialing" -> PillTone.WARNING
    "cancelled", "void", "failed", "conflict", "error", "out_of_stock" -> PillTone.CRITICAL
    "confirmed", "shipped", "processing" -> PillTone.INFO
    else -> PillTone.NEUTRAL
}
