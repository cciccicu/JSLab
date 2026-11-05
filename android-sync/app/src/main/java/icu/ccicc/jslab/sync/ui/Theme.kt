package icu.ccicc.jslab.sync.ui

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import icu.ccicc.jslab.sync.data.ThemeMode
import androidx.core.view.WindowCompat

val Accent = Color(0xFF3B82F6)
val Success = Color(0xFF10B981)
private val Light = lightColorScheme(
    primary = Accent, onPrimary = Color.White, primaryContainer = Color(0xFFEFF6FF),
    onPrimaryContainer = Color(0xFF1D4ED8), secondary = Color(0xFF64748B),
    secondaryContainer = Color(0xFFEFF6FF), onSecondaryContainer = Color(0xFF1D4ED8),
    background = Color(0xFFF8FAFC), onBackground = Color(0xFF334155),
    surface = Color.White, onSurface = Color(0xFF334155),
    surfaceVariant = Color(0xFFF1F5F9), onSurfaceVariant = Color(0xFF64748B),
    outline = Color(0xFFCBD5E1), outlineVariant = Color(0xFFE2E8F0),
)
private val Dark = darkColorScheme(
    primary = Color(0xFF60A5FA), onPrimary = Color(0xFF0F172A), primaryContainer = Color(0xFF172D4C),
    onPrimaryContainer = Color(0xFFBFDBFE), secondary = Color(0xFFCBD5E1),
    secondaryContainer = Color(0xFF203956), onSecondaryContainer = Color(0xFFBFDBFE),
    background = Color(0xFF0F172A), onBackground = Color(0xFFE2E8F0),
    surface = Color(0xFF182337), onSurface = Color(0xFFE2E8F0),
    surfaceVariant = Color(0xFF243247), onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF475569), outlineVariant = Color(0xFF334155),
)

@Composable
fun SyncTheme(mode: ThemeMode = ThemeMode.System, content: @Composable () -> Unit) {
    val dark = mode == ThemeMode.Dark || (mode == ThemeMode.System && isSystemInDarkTheme())
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        (view.context as? Activity)?.window?.let { window ->
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Typography(
        headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold),
        headlineMedium = TextStyle(fontSize = 27.sp, lineHeight = 38.sp, fontWeight = FontWeight.Bold),
        titleLarge = TextStyle(fontSize = 21.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold),
        titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 24.sp),
        bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 22.sp),
        labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
        labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, letterSpacing = 1.sp),
    ), content = content)
}
