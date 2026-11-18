package com.coop.android.core.util

import java.security.SecureRandom

object UlidGenerator {
    private val encoding = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray()
    private val random = SecureRandom()

    @Synchronized
    fun next(): String {
        val time = System.currentTimeMillis()
        val chars = CharArray(26)
        var t = time
        for (i in 9 downTo 0) {
            chars[i] = encoding[(t and 31L).toInt()]
            t = t ushr 5
        }
        val randBytes = ByteArray(10)
        random.nextBytes(randBytes)
        var idx = 10
        var buffer = 0
        var bitsLeft = 0
        for (b in randBytes) {
            buffer = (buffer shl 8) or (b.toInt() and 0xFF)
            bitsLeft += 8
            while (bitsLeft >= 5 && idx < 26) {
                chars[idx++] = encoding[(buffer ushr (bitsLeft - 5)) and 31]
                bitsLeft -= 5
            }
        }
        while (idx < 26) {
            chars[idx++] = encoding[random.nextInt(32)]
        }
        return String(chars)
    }
}
