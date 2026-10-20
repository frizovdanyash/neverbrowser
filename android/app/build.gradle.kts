plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val geckoviewVersion: String = providers.gradleProperty("geckoviewVersion").orNull ?: "131.0.20240913135429"

android {
    namespace = "dev.neverbrowser"
    compileSdk = 34

    defaultConfig {
        applicationId = "dev.neverbrowser"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("org.mozilla.geckoview:geckoview:$geckoviewVersion")
}
