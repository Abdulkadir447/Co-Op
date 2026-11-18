package com.coop.android.core.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class ConnectivityObserver(context: Context) {

    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val _isOnline = MutableStateFlow(checkCurrentOnline())
    val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _isOnline.value = true
        }

        override fun onLost(network: Network) {
            _isOnline.value = checkCurrentOnline()
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            _isOnline.value = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
    }

    init {
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            cm.registerNetworkCallback(request, callback)
        } catch (_: Exception) {
            _isOnline.value = checkCurrentOnline()
        }
    }

    private fun checkCurrentOnline(): Boolean {
        val active = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(active) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
