package com.coop.android

import android.app.Application
import com.coop.android.core.di.AppContainer

class CoopApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.syncEngine.schedulePeriodicBackgroundSync()
    }
}
