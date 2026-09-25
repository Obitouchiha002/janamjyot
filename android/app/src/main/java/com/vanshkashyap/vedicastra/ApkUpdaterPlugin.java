package com.vanshkashyap.vedicastra;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Updating without leaving the app.
 *
 * JanamJyot is sideloaded, so an update used to mean: a browser opens, a file
 * downloads into Downloads, the person finds it in a notification, taps it,
 * and meets the installer — five steps outside the app, and most people simply
 * did not finish them. Here the app downloads the APK itself, shows the
 * progress, and hands the finished file straight to Android's installer.
 *
 * REQUEST_INSTALL_PACKAGES does NOT mean silent installation: Android still
 * shows its own "Do you want to install this app?" screen and the person still
 * taps Install. What the permission removes is the detour through the browser.
 * The one-time "allow this app to install apps" toggle is asked for only at
 * the moment it is needed, and this opens that exact settings screen.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String APK_TYPE = "application/vnd.android.package-archive";

    /** Android 8+ asks per-app for permission to install; before that it was a global setting. */
    private boolean allowed() {
        Context ctx = getContext();
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || ctx.getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", allowed());
        call.resolve(ret);
    }

    /** The system screen where the person allows JanamJyot to install its own updates. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the install permission screen.");
        }
    }

    /**
     * Download the APK, reporting progress on the `apkProgress` event, and
     * resolve with the file's path. The system download manager does the work,
     * so it survives a screen lock and shows its own notification.
     */
    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String version = call.getString("version", "latest");
        if (url == null || url.isEmpty()) {
            call.reject("No download URL.");
            return;
        }

        final Context ctx = getContext();
        File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            call.reject("No storage available for the download.");
            return;
        }
        // One APK at a time: the last version's file is dead weight, and the
        // download manager refuses to write over a file that already exists.
        File[] old = dir.listFiles();
        if (old != null) {
            for (File f : old) {
                if (f.getName().startsWith("JanamJyot-") && f.getName().endsWith(".apk")) f.delete();
            }
        }
        final File file = new File(dir, "JanamJyot-" + version + ".apk");

        final DownloadManager downloads = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        final long id;
        try {
            id = downloads.enqueue(
                    new DownloadManager.Request(Uri.parse(url))
                            .setTitle("JanamJyot " + version)
                            .setDescription("Downloading the update")
                            .setMimeType(APK_TYPE)
                            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                            .setDestinationUri(Uri.fromFile(file))
            );
        } catch (Exception e) {
            call.reject("The download could not start.");
            return;
        }

        new Thread(() -> {
            while (true) {
                try { Thread.sleep(400); } catch (InterruptedException ignored) { }
                Cursor cursor = downloads.query(new DownloadManager.Query().setFilterById(id));
                if (cursor == null) {
                    call.reject("The download was lost.");
                    return;
                }
                try {
                    if (!cursor.moveToFirst()) {
                        call.reject("The download was cancelled.");
                        return;
                    }
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        JSObject ret = new JSObject();
                        ret.put("path", file.getAbsolutePath());
                        ret.put("canInstall", allowed());
                        call.resolve(ret);
                        return;
                    }
                    if (status == DownloadManager.STATUS_FAILED) {
                        file.delete();
                        call.reject("The download failed. Check the connection and try again.");
                        return;
                    }
                    JSObject progress = new JSObject();
                    progress.put("percent", total > 0 ? (int) (done * 100 / total) : 0);
                    progress.put("bytes", done);
                    progress.put("total", total);
                    notifyListeners("apkProgress", progress);
                } catch (Exception e) {
                    call.reject("The download could not be read.");
                    return;
                } finally {
                    cursor.close();
                }
            }
        }).start();
    }

    /** Hand the downloaded file to Android's installer. */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("No file to install.");
            return;
        }
        File file = new File(path);
        if (!file.exists()) {
            call.reject("The downloaded file is gone. Please download it again.");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, APK_TYPE)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Android could not open the installer.");
        }
    }
}
