package com.coop.android.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.coop.android.ui.theme.CoopThemeTokens

@Composable
fun CoopMark(
    size: Dp = 32.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val sx = this.size.width / 48f
        val sy = this.size.height / 48f

        // Top petal
        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(Color(0xFF5B5FEF), Color(0xFF4143D5)),
                start = Offset(14f * sx, 5f * sy),
                end = Offset(34f * sx, 26f * sy),
            ),
            topLeft = Offset(14f * sx, 5f * sy),
            size = Size(20f * sx, 21f * sy),
            cornerRadius = CornerRadius(9f * sx, 9f * sy),
        )

        // Left-bottom petal
        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(Color(0xFF8A4CFC), Color(0xFF712AE2)),
                start = Offset(6f * sx, 19f * sy),
                end = Offset(26f * sx, 40f * sy),
            ),
            topLeft = Offset(6f * sx, 19f * sy),
            size = Size(20f * sx, 21f * sy),
            cornerRadius = CornerRadius(9f * sx, 9f * sy),
            alpha = 0.94f,
        )

        // Right-bottom petal
        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(Color(0xFFC0C1FF), Color(0xFF8A8DF5)),
                start = Offset(22f * sx, 19f * sy),
                end = Offset(42f * sx, 40f * sy),
            ),
            topLeft = Offset(22f * sx, 19f * sy),
            size = Size(20f * sx, 21f * sy),
            cornerRadius = CornerRadius(9f * sx, 9f * sy),
            alpha = 0.90f,
        )

        // Four-point center spark
        val spark = Path().apply {
            moveTo(24f * sx, 17f * sy)
            quadraticTo(26.6f * sx, 22.4f * sy, 30.5f * sx, 25f * sy)
            quadraticTo(26.6f * sx, 27.6f * sy, 24f * sx, 33f * sy)
            quadraticTo(21.4f * sx, 27.6f * sy, 17.5f * sx, 25f * sy)
            quadraticTo(21.4f * sx, 22.4f * sy, 24f * sx, 17f * sy)
            close()
        }
        drawPath(path = spark, color = Color.White, alpha = 0.96f)
    }
}

@Composable
fun CoopLogo(
    markSize: Dp = 32.dp,
    showWordmark: Boolean = true,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CoopMark(size = markSize)
        if (showWordmark) {
            Column {
                Text(
                    text = "CO OP",
                    color = palette.primary,
                    fontSize = (markSize.value * 0.62f).sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.5).sp,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        text = subtitle.uppercase(),
                        color = palette.onSurfaceVariant,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.1.sp,
                    )
                }
            }
        }
    }
}
