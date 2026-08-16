package de.dockdo.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class UrlSetupActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_url_setup)

        val prefs = getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        val input = findViewById<EditText>(R.id.server_input)
        prefs.getString(MainActivity.KEY_URL, null)?.let { input.setText(it) }

        findViewById<Button>(R.id.btn_connect).setOnClickListener {
            val url = normalizeUrl(input.text.toString())
            if (url.isEmpty()) {
                input.error = "Bitte eine Server-Adresse eingeben"
                return@setOnClickListener
            }
            prefs.edit().putString(MainActivity.KEY_URL, url).apply()
            Toast.makeText(this, "Verbunden mit $url", Toast.LENGTH_SHORT).show()
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }

    private fun normalizeUrl(raw: String): String {
        var u = raw.trim().removeSuffix("/")
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://$u"
        return u
    }
}