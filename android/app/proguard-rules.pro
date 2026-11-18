# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.SerializationKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.coop.android.**$$serializer { *; }
-keepclassmembers class com.coop.android.** {
    *** Companion;
}
-keepclasseswithmembers class com.coop.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit
-keepattributes Signature, Exceptions
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepclasseswithmembers interface * {
    @retrofit2.http.* <methods>;
}

# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**
