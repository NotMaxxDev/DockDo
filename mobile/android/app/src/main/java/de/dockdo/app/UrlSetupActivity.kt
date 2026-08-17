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
            val url = parseServerUrl(input.text.toString())
            if (url == null) {
                input.error = "Bitte nur eine Domain oder eine IP mit Port 3000 eingeben (z. B. https://meine-domain.de oder http://192.168.1.5:3000). Port 3001 ist nicht erlaubt."
                return@setOnClickListener
            }
            prefs.edit().putString(MainActivity.KEY_URL, url).apply()
            Toast.makeText(this, "Verbunden mit $url", Toast.LENGTH_SHORT).show()
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }
}