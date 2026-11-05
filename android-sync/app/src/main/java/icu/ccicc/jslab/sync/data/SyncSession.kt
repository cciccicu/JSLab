package icu.ccicc.jslab.sync.data

import icu.ccicc.jslab.sync.protocol.TransferProgress
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** The workflow can be checked with a local session without binding to Mi Fitness. */
interface SyncSession {
    val state: StateFlow<LinkState>
    val changes: Flow<Unit>
    val errors: Flow<String>
    val deviceChanges: Flow<Unit>
    var proxyEnabled: Boolean
    suspend fun discover()
    suspend fun connect(device: WearDevice)
    suspend fun refresh()
    suspend fun create(name: String)
    suspend fun read(name: String, progress: (TransferProgress) -> Unit): String
    suspend fun write(name: String, content: String, overwrite: Boolean, progress: (TransferProgress) -> Unit)
    suspend fun rename(name: String, newName: String)
    suspend fun delete(name: String)
    suspend fun readStorage(name: String, progress: (TransferProgress) -> Unit): String = error("当前手环不支持编辑脚本数据，请升级 JSLab")
    suspend fun writeStorage(name: String, base: String, content: String, progress: (TransferProgress) -> Unit): Unit = error("当前手环不支持编辑脚本数据，请升级 JSLab")
    suspend fun launch()
    fun disconnect()
    fun close()
}
