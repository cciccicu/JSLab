package icu.ccicc.jslab.sync

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import icu.ccicc.jslab.sync.ui.SyncApp

class MainActivity : ComponentActivity() {
    private val model by viewModels<SyncViewModel>()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { SyncApp(model) }
    }
    override fun onStop() {
        model.flushDraft()
        super.onStop()
    }
}
