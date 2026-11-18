package com.coop.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

enum class ThemeMode(val wireValue: String, val label: String) {
    LIGHT("light", "Light"),
    DARK("dark", "Dark"),
    SYSTEM("system", "System");

    companion object {
        fun fromWire(value: String?): ThemeMode =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: SYSTEM
    }
}

object CoopThemeTokens {
    val colors: CoopColorPalette
        @Composable
        @ReadOnlyComposable
        get() = LocalCoopColors.current
}

@Composable
fun CoopTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    content: @Composable () -> Unit,
) {
    val darkTheme = when (themeMode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val palette = if (darkTheme) DarkCoopColors else LightCoopColors

    val materialScheme = if (darkTheme) {
        darkColorScheme(
            primary = palette.primary,
            onPrimary = palette.onPrimary,
            primaryContainer = palette.primaryContainer,
            onPrimaryContainer = palette.onPrimaryContainer,
            secondary = palette.secondary,
            onSecondary = palette.onSecondary,
            secondaryContainer = palette.secondaryContainer,
            onSecondaryContainer = palette.onSecondaryContainer,
            tertiary = palette.tertiary,
            onTertiary = palette.onTertiary,
            tertiaryContainer = palette.tertiaryContainer,
            onTertiaryContainer = palette.onTertiaryContainer,
            background = palette.background,
            onBackground = palette.onBackground,
            surface = palette.surface,
            onSurface = palette.onSurface,
            surfaceVariant = palette.surfaceVariant,
            onSurfaceVariant = palette.onSurfaceVariant,
            surfaceContainerLowest = palette.surfaceContainerLowest,
            surfaceContainerLow = palette.surfaceContainerLow,
            surfaceContainer = palette.surfaceContainer,
            surfaceContainerHigh = palette.surfaceContainerHigh,
            surfaceContainerHighest = palette.surfaceContainerHighest,
            outline = palette.outline,
            outlineVariant = palette.outlineVariant,
            error = palette.error,
            onError = palette.onError,
            errorContainer = palette.errorContainer,
            onErrorContainer = palette.onErrorContainer,
            inverseSurface = palette.inverseSurface,
            inverseOnSurface = palette.inverseOnSurface,
            inversePrimary = palette.inversePrimary,
        )
    } else {
        lightColorScheme(
            primary = palette.primary,
            onPrimary = palette.onPrimary,
            primaryContainer = palette.primaryContainer,
            onPrimaryContainer = palette.onPrimaryContainer,
            secondary = palette.secondary,
            onSecondary = palette.onSecondary,
            secondaryContainer = palette.secondaryContainer,
            onSecondaryContainer = palette.onSecondaryContainer,
            tertiary = palette.tertiary,
            onTertiary = palette.onTertiary,
            tertiaryContainer = palette.tertiaryContainer,
            onTertiaryContainer = palette.onTertiaryContainer,
            background = palette.background,
            onBackground = palette.onBackground,
            surface = palette.surface,
            onSurface = palette.onSurface,
            surfaceVariant = palette.surfaceVariant,
            onSurfaceVariant = palette.onSurfaceVariant,
            surfaceContainerLowest = palette.surfaceContainerLowest,
            surfaceContainerLow = palette.surfaceContainerLow,
            surfaceContainer = palette.surfaceContainer,
            surfaceContainerHigh = palette.surfaceContainerHigh,
            surfaceContainerHighest = palette.surfaceContainerHighest,
            outline = palette.outline,
            outlineVariant = palette.outlineVariant,
            error = palette.error,
            onError = palette.onError,
            errorContainer = palette.errorContainer,
            onErrorContainer = palette.onErrorContainer,
            inverseSurface = palette.inverseSurface,
            inverseOnSurface = palette.inverseOnSurface,
            inversePrimary = palette.inversePrimary,
        )
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    CompositionLocalProvider(LocalCoopColors provides palette) {
        MaterialTheme(
            colorScheme = materialScheme,
            typography = CoopMaterialTypography,
            shapes = CoopShapes,
            content = content,
        )
    }
}
