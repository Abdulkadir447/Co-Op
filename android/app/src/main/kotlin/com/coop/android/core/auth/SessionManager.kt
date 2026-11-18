package com.coop.android.core.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.coop.android.BuildConfig
import com.coop.android.core.network.dto.AuthMeDto
import com.coop.android.core.util.CurrencyStore
import com.coop.android.ui.theme.ThemeMode
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

data class SessionState(
    val isSignedIn: Boolean = false,
    val isDemoMode: Boolean = false,
    val serverUrl: String = BuildConfig.DEFAULT_API_URL,
    val userId: String? = null,
    val email: String? = null,
    val businessId: Int? = null,
    val businessName: String = "",
    val role: String = "owner",
    val currency: String = "USD",
    val startedManualOnboarding: Boolean = false,
    val sessionExpiredNotice: Boolean = false,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val notifDailySummary: Boolean = true,
    val notifLowStock: Boolean = true,
)

class SessionManager(context: Context) {

    private val prefs: SharedPreferences = createEncryptedPrefs(context)

    private val _state = MutableStateFlow(loadInitialState())
    val state: StateFlow<SessionState> = _state.asStateFlow()

    private val _unauthorizedEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvents: SharedFlow<Unit> = _unauthorizedEvents.asSharedFlow()

    private fun createEncryptedPrefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (_: Exception) {
            context.getSharedPreferences(PREFS_NAME_FALLBACK, Context.MODE_PRIVATE)
        }
    }

    private fun loadInitialState(): SessionState {
        val token = prefs.getString(KEY_TOKEN, null)
        val demoMode = prefs.getBoolean(KEY_DEMO_MODE, false)
        val currency = prefs.getString(KEY_CURRENCY, "USD") ?: "USD"
        CurrencyStore.set(currency)
        return SessionState(
            isSignedIn = !token.isNullOrBlank() || demoMode,
            isDemoMode = demoMode,
            serverUrl = prefs.getString(KEY_SERVER_URL, BuildConfig.DEFAULT_API_URL)
                ?: BuildConfig.DEFAULT_API_URL,
            userId = prefs.getString(KEY_USER_ID, null),
            email = prefs.getString(KEY_EMAIL, null),
            businessId = prefs.getInt(KEY_BUSINESS_ID, -1).takeIf { it > 0 },
            businessName = prefs.getString(KEY_BUSINESS_NAME, "") ?: "",
            role = prefs.getString(KEY_ROLE, "owner") ?: "owner",
            currency = currency,
            startedManualOnboarding = prefs.getBoolean(KEY_STARTED_MANUAL, false),
            themeMode = ThemeMode.fromWire(prefs.getString(KEY_THEME_MODE, "system")),
            notifDailySummary = prefs.getBoolean(KEY_NOTIF_DAILY_SUMMARY, true),
            notifLowStock = prefs.getBoolean(KEY_NOTIF_LOW_STOCK, true),
        )
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun getServerUrl(): String =
        prefs.getString(KEY_SERVER_URL, BuildConfig.DEFAULT_API_URL) ?: BuildConfig.DEFAULT_API_URL

    fun setServerUrl(url: String) {
        val normalized = url.trim().trimEnd('/').ifBlank { BuildConfig.DEFAULT_API_URL }
        prefs.edit().putString(KEY_SERVER_URL, normalized).apply()
        _state.value = _state.value.copy(serverUrl = normalized)
    }

    fun signInWithToken(token: String, email: String? = null) {
        val clean = token.trim().removePrefix("Bearer ").trim()
        prefs.edit()
            .putString(KEY_TOKEN, clean)
            .putBoolean(KEY_DEMO_MODE, false)
            .apply { if (!email.isNullOrBlank()) putString(KEY_EMAIL, email.trim()) }
            .apply()
        _state.value = _state.value.copy(
            isSignedIn = clean.isNotBlank(),
            isDemoMode = false,
            email = email?.trim() ?: _state.value.email,
            sessionExpiredNotice = false,
        )
    }

    fun signInDemoOffline(businessName: String = "Co-op Demo Store", email: String = "owner@coop.local") {
        prefs.edit()
            .remove(KEY_TOKEN)
            .putBoolean(KEY_DEMO_MODE, true)
            .putString(KEY_USER_ID, "demo_owner")
            .putString(KEY_EMAIL, email)
            .putInt(KEY_BUSINESS_ID, 1)
            .putString(KEY_BUSINESS_NAME, businessName)
            .putString(KEY_ROLE, "owner")
            .putString(KEY_CURRENCY, "USD")
            .apply()
        CurrencyStore.set("USD")
        _state.value = _state.value.copy(
            isSignedIn = true,
            isDemoMode = true,
            userId = "demo_owner",
            email = email,
            businessId = 1,
            businessName = businessName,
            role = "owner",
            currency = "USD",
            sessionExpiredNotice = false,
        )
    }

    fun updateIdentity(me: AuthMeDto) {
        CurrencyStore.set(me.currency)
        prefs.edit()
            .putString(KEY_USER_ID, me.userId)
            .putInt(KEY_BUSINESS_ID, me.businessId ?: -1)
            .putString(KEY_BUSINESS_NAME, me.businessName)
            .putString(KEY_ROLE, me.role)
            .putString(KEY_CURRENCY, me.currency)
            .apply { if (!me.email.isNullOrBlank()) putString(KEY_EMAIL, me.email) }
            .apply()
        _state.value = _state.value.copy(
            userId = me.userId,
            businessId = me.businessId,
            businessName = me.businessName,
            role = me.role,
            currency = me.currency,
            email = me.email ?: _state.value.email,
        )
    }

    fun updateCurrency(currency: String) {
        CurrencyStore.set(currency)
        prefs.edit().putString(KEY_CURRENCY, currency).apply()
        _state.value = _state.value.copy(currency = currency)
    }

    fun setThemeMode(mode: ThemeMode) {
        prefs.edit().putString(KEY_THEME_MODE, mode.wireValue).apply()
        _state.value = _state.value.copy(themeMode = mode)
    }

    fun setNotificationPrefs(dailySummary: Boolean? = null, lowStock: Boolean? = null) {
        val nextDaily = dailySummary ?: _state.value.notifDailySummary
        val nextLow = lowStock ?: _state.value.notifLowStock
        prefs.edit()
            .putBoolean(KEY_NOTIF_DAILY_SUMMARY, nextDaily)
            .putBoolean(KEY_NOTIF_LOW_STOCK, nextLow)
            .apply()
        _state.value = _state.value.copy(notifDailySummary = nextDaily, notifLowStock = nextLow)
    }

    fun markStartedManualOnboarding() {
        prefs.edit().putBoolean(KEY_STARTED_MANUAL, true).apply()
        _state.value = _state.value.copy(startedManualOnboarding = true)
    }

    fun notifyUnauthorized() {
        if (!_state.value.isDemoMode && _state.value.isSignedIn) {
            signOut(sessionExpired = true)
            _unauthorizedEvents.tryEmit(Unit)
        }
    }

    fun clearSessionExpiredNotice() {
        _state.value = _state.value.copy(sessionExpiredNotice = false)
    }

    fun signOut(sessionExpired: Boolean = false) {
        prefs.edit()
            .remove(KEY_TOKEN)
            .putBoolean(KEY_DEMO_MODE, false)
            .remove(KEY_USER_ID)
            .remove(KEY_BUSINESS_ID)
            .remove(KEY_BUSINESS_NAME)
            .remove(KEY_ROLE)
            .apply()
        _state.value = _state.value.copy(
            isSignedIn = false,
            isDemoMode = false,
            userId = null,
            businessId = null,
            businessName = "",
            role = "owner",
            sessionExpiredNotice = sessionExpired,
        )
    }

    companion object {
        private const val PREFS_NAME = "coop_secure_session"
        private const val PREFS_NAME_FALLBACK = "coop_session_fallback"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_DEMO_MODE = "demo_mode"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_BUSINESS_ID = "business_id"
        private const val KEY_BUSINESS_NAME = "business_name"
        private const val KEY_ROLE = "role"
        private const val KEY_CURRENCY = "currency"
        private const val KEY_STARTED_MANUAL = "started_manual"
        private const val KEY_THEME_MODE = "theme_mode"
        private const val KEY_NOTIF_DAILY_SUMMARY = "notif_daily_summary"
        private const val KEY_NOTIF_LOW_STOCK = "notif_low_stock"
    }
}
