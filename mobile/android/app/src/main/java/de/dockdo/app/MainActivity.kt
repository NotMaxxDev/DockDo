package de.dockdo.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.floatingactionbutton.FloatingActionButton

class MainActivity : AppCompatActivity() {

    companion object {
        const val PREFS = "dockdo_prefs"
        const val KEY_URL = "server_url"
    }

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        var url = prefs.getString(KEY_URL, null)?.trim()

        if (url.isNullOrEmpty()) {
            startActivity(Intent(this, UrlSetupActivity::class.java))
            finish()
            return
        }
        url = normalizeUrl(url)
        prefs.edit().putString(KEY_URL, url).apply()

        webView = findViewById(R.id.webview)
        setupWebView(webView)

        findViewById<FloatingActionButton>(R.id.fab_menu).setOnClickListener { showMenu() }

        webView.loadUrl(url)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView(wv: WebView) {
        val s = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            wv.setLayerType(WebView.LAYER_TYPE_HARDWARE, null)
        }

        wv.webChromeClient = WebChromeClient()
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }

            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler, error: SslError) {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.ssl_title)
                    .setMessage(R.string.ssl_message)
                    .setPositiveButton(R.string.ssl_proceed) { _, _ -> handler.proceed() }
                    .setNegativeButton(R.string.cancel) { _, _ -> handler.cancel() }
                    .setOnCancelListener { handler.cancel() }
                    .show()
            }
        }
    }

    private fun normalizeUrl(raw: String): String {
        var u = raw.trim().removeSuffix("/")
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://$u"
        return u
    }

    private fun showMenu() {
        val items = arrayOf(getString(R.string.reload), getString(R.string.change_server), getString(R.string.about))
        AlertDialog.Builder(this)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> webView.reload()
                    1 -> changeServer()
                    2 -> showAbout()
                }
            }
            .show()
    }

    private fun changeServer() {
        startActivity(Intent(this, UrlSetupActivity::class.java))
    }

    private fun showAbout() {
        AlertDialog.Builder(this)
            .setTitle(R.string.app_name)
            .setMessage(R.string.about_text)
            .setPositiveButton(R.string.ok, null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}