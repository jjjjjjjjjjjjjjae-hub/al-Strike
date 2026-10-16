# al-Strike Android lobby

Android lobby prototype for **al-Strike**. It opens with **ALMAS OFFICIAL**, checks the update manifest, loads the supplied ALMAS GLB, and plays the first clip (`Idle_#1_Original`) on a loop. The interface and settings are in Kazakh.

The first release contains the lobby only. Game modes, accounts, friends, inventory, and matchmaking are visual entry points for later development.

## Build

Use JDK 17, Android SDK 35, and Gradle 8.11.1. Restore the model first:

```sh
mkdir -p app/src/main/assets/models
cat model-parts/part-*.bin > app/src/main/assets/models/ALMAS_Animations_1_2_LIGHT.glb
gradle assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions builds and uploads the same file after a push to `main`.

## Assets and updates

- The character is the exact unmodified `ALMAS_Animations_1_2_LIGHT.glb` supplied by the user at `D:\ALMAS_Animations_1_2_LIGHT.glb`. Its SHA-256 is `5800b069b8000e69bcccc4a1f4e9466c14d175ca39d1da7ad4e91f3d4dd5ae4b`. The first clip is `Idle_#1_Original`. GitHub stores the GLB in ordered `model-parts/` chunks; the build rejoins them and verifies the hash before assembling the APK.
- To add the splash photo later, replace the CSS background or add an image in `app/src/main/assets/` and reference it from `style.css`.
- `update.json` is read from this repository's `main` branch. Increment `versionCode` and set `downloadUrl` to a GitHub release when publishing a new APK. Android asks the user to approve installation; the app cannot silently install updates.
- Three.js 0.163.0 is bundled in `app/src/main/assets/vendor/` under its MIT license.
