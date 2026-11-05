package icu.ccicc.jslab.sync.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.IOException
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.Flow

private val Context.settings by preferencesDataStore("sync_settings")
enum class ThemeMode { System, Light, Dark }
data class SyncPreferences(val theme: ThemeMode = ThemeMode.System, val cloudProxy: Boolean = true)

interface SyncSettings {
    val flow: Flow<SyncPreferences>
    suspend fun theme(value: ThemeMode)
    suspend fun proxy(enabled: Boolean)
}

class Preferences(context: Context) : SyncSettings {
    private val store = context.applicationContext.settings
    private val themeKey = stringPreferencesKey("theme")
    private val proxyKey = booleanPreferencesKey("cloud_proxy")
    override val flow = store.data.catch { error -> if (error is IOException) emit(emptyPreferences()) else throw error }.map {
        SyncPreferences(runCatching { ThemeMode.valueOf(it[themeKey] ?: "System") }.getOrDefault(ThemeMode.System), it[proxyKey] ?: true)
    }
    override suspend fun theme(value: ThemeMode) { store.edit { it[themeKey] = value.name } }
    override suspend fun proxy(enabled: Boolean) { store.edit { it[proxyKey] = enabled } }
}
