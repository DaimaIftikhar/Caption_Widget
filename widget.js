const CW_API_URL = "https://script.google.com/macros/s/AKfycbz7UC-otTJqqJdOuEk_xJ0Sj0cQdYlJTA4pLBqasDepyukjkIeFe0xhJkEGNvNDx899_A/exec";

(function () {
  class CaptionWidget {
    constructor(hostEl) {
      this.hostEl = hostEl;
      this.widgetId = hostEl.getAttribute("data-id");
      this.title = hostEl.getAttribute("data-title") || "Caption This";
      this.photo = hostEl.getAttribute("data-photo") || "";
      this.items = [];
      this.currentTab = "top";
      this.deviceId = this.ensureDeviceId();
      this.root = hostEl.attachShadow({ mode: "open" });

      this.renderShell();
      this.bindBasics();
      this.loadData();
    }

    ensureDeviceId() {
      const KEY = "cw-device-id";
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = "d-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(KEY, id);
      }
      return id;
    }

// render +styling 
    renderShell() {
      const style = `
        :host { box-sizing: border-box; }
        .cw-wrap { font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#111; }
        .cw-card { border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; max-width: 720px; }
        .cw-head { padding:12px 16px; font-weight:600; font-size:16px; background:#fafafa; border-bottom:1px solid #eee; }
        .cw-photo { width:100%; display:block; aspect-ratio: 16/10; object-fit: cover; background:#eee; }
        .cw-input { padding:12px 16px; display:grid; gap:8px; }
        .cw-input textarea { width:100%; min-height:72px; max-height:160px; resize:vertical; padding:10px 12px; border:1px solid #d1d5db; border-radius:10px; font-size:14px; line-height:1.4; }
        .cw-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .cw-counter { font-size:12px; color:#6b7280; }
        .cw-btn { appearance:none; border:0; background:#111827; color:#fff; padding:10px 14px; font-size:14px; border-radius:10px; cursor:pointer; }
        .cw-btn[disabled]{ opacity:.6; cursor:not-allowed; }
        .cw-tabs { display:flex; gap:4px; padding:8px; border-top:1px solid #eee; border-bottom:1px solid #eee; background:#fafafa; }
        .cw-tab { border:0; background:#e5e7eb; padding:8px 12px; border-radius:999px; font-size:13px; cursor:pointer; }
        .cw-tab.active { background:#111827; color:#fff; }
        .cw-list { display:grid; gap:8px; padding:10px; }
        .cw-item { display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; background:#fff; }
        .cw-text-wrap { display:flex; flex-direction:column; flex:1; }
        .cw-text { font-size:14px; line-height:1.35; word-break:break-word; }
        .cw-time { font-size:11px; color:#6b7280; margin-top:4px; }
        .cw-vote { border:0; background:#f3f4f6; padding:6px 10px; border-radius:999px; font-size:13px; cursor:pointer; }
        .cw-vote:disabled { opacity:.6; cursor:not-allowed; }
        .cw-empty { color:#6b7280; font-size:13px; text-align:center; padding:10px; }
        .cw-toast { position:fixed; left:50%; transform:translateX(-50%); bottom:18px; background:#111827; color:#fff; font-size:13px; padding:8px 12px; border-radius:999px; display:none; z-index:2147483647; }
        @media (max-width: 360px) {
          .cw-head { font-size:15px }
          .cw-btn { padding:9px 12px; }
        }
      `;

      this.root.innerHTML = `
        <style>${style}</style>
        <div class="cw-wrap">
          <div class="cw-card">
            <div class="cw-head">${this.escape(this.title)}</div>
            ${this.photo ? `<img class="cw-photo" alt="photo" src="${this.escapeAttr(this.photo)}">` : ""}
            <div class="cw-input">
              <textarea class="cw-ta" maxlength="140" placeholder="Write a funny caption (max 140 chars)"></textarea>
              <div class="cw-row">
                <span class="cw-counter">140</span>
                <button class="cw-btn cw-submit">Submit</button>
              </div>
            </div>
            <div class="cw-tabs">
              <button class="cw-tab cw-tab-top active" data-tab="top">Top</button>
              <button class="cw-tab cw-tab-new" data-tab="new">New</button>
            </div>
            <div class="cw-list"><div class="cw-empty">Loading…</div></div>
          </div>
        </div>
        <div class="cw-toast"></div>
      `;
    }

    bindBasics() {
      const ta = this.$(".cw-ta");
      const counter = this.$(".cw-counter");
      const submit = this.$(".cw-submit");

      ta.addEventListener("input", () => {
        const left = 140 - ta.value.length;
        counter.textContent = String(left);
      });

      submit.addEventListener("click", async () => {
        const text = ta.value.trim();
        if (!text) return;
        await this.submitCaption(text, submit, ta, counter);
      });

      this.$$(".cw-tab").forEach(btn => {
        btn.addEventListener("click", () => {
          this.$$(".cw-tab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          this.currentTab = btn.getAttribute("data-tab");
          this.renderList();
        });
      });
    }

    // data loading and network error
    async loadData() {
      try {
        const res = await fetch(`${CW_API_URL}?action=list&widget=${encodeURIComponent(this.widgetId)}`);
        const json = await res.json();
        this.items = Array.isArray(json.items) ? json.items.map(it => ({
          ...it,
          tsReadable: this.formatReadable(it.ts)   
        })) : [];
        this.renderList();
      } catch (e) {
        this.toast("Network error");
      }
    }

    async submitCaption(text, submitBtn, ta, counterEl) {
      const payload = {
        action: "submit",
        widget: this.widgetId,
        text,
        by: `guest-${this.deviceId.slice(0, 6)}`
      };
      const restore = this.btnBusy(submitBtn, true);
      try {
        const res = await fetch(CW_API_URL, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data && !data.error && data.id) {
          this.items.unshift({
            ...data,
            tsReadable: this.formatReadable(data.ts) 
          });
          ta.value = "";
          counterEl.textContent = "140";
          this.currentTab = "new";
          this.$$(".cw-tab").forEach(b => {
            b.classList.toggle("active", b.getAttribute("data-tab") === "new");
          });
          this.renderList();
          this.toast("Submitted!");
        } else if (data && data.error === "Duplicate") {
          this.toast("Duplicate");
        } else {
          this.toast("Network error");
        }
      } catch (e) {
        this.toast("Network error");
      } finally {
        restore();
      }
    }

    async vote(id, btn) {
      const voteKey = `cw-voted-${this.widgetId}-${id}`;
      if (localStorage.getItem(voteKey)) {
        this.toast("Already voted");
        return;
      }
      const restore = this.btnBusy(btn, true);
      try {
        const res = await fetch(CW_API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "vote",
            widget: this.widgetId,
            id,
            voter: this.deviceId
          })
        });
        const data = await res.json();
        if (data && data.ok) {
          localStorage.setItem(voteKey, "1");
          const item = this.items.find(x => x.id === id);
          if (item) item.votes = data.votes;
          btn.textContent = `▲ ${data.votes}`;
          btn.disabled = true;
          if (this.currentTab === "top") this.renderList();
        } else if (data && data.error === "Already voted") {
          this.toast("Already voted");
        } else {
          this.toast("Network error");
        }
      } catch (e) {
        this.toast("Network error");
      } finally {
        restore();
      }
    }

    renderList() {
      const listEl = this.$(".cw-list");
      let arr = [...this.items];

      if (this.currentTab === "top") {
        arr.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        arr = arr.slice(0, 5);
      } else {
        arr.sort((a, b) => new Date(b.ts) - new Date(a.ts));
        arr = arr.slice(0, 10);
      }

      if (arr.length === 0) {
        listEl.innerHTML = `<div class="cw-empty">No captions yet.</div>`;
        return;
      }

      listEl.innerHTML = arr.map(it => `
        <div class="cw-item">
          <div class="cw-text-wrap">
            <div class="cw-text">${this.escape(it.text)}</div>
            <div class="cw-time">${this.escape(it.tsReadable)}</div>
          </div>
          <button class="cw-vote" data-id="${this.escapeAttr(it.id)}">▲ ${Number(it.votes || 0)}</button>
        </div>
      `).join("");

      this.$$(".cw-vote").forEach(b => {
        b.addEventListener("click", () => this.vote(b.getAttribute("data-id"), b));
      });
    }

    formatReadable(tsNum) {
      const d = new Date(tsNum);
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    btnBusy(btn, busy) {
      if (busy) {
        const old = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Submitting…";
        return () => {
          btn.disabled = false;
          btn.textContent = old;
        };
      } else {
        btn.disabled = false;
      }
    }

    toast(msg) {
      const t = this.$(".cw-toast");
      t.textContent = msg;
      t.style.display = "block";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => (t.style.display = "none"), 1800);
    }

    $(sel) { return this.root.querySelector(sel); }
    $$(sel) { return Array.from(this.root.querySelectorAll(sel)); }

    escape(s = "") {
      return s.replace(/[&<>"']/g, c => ({
        "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
      }[c]));
    }
    escapeAttr(s = "") {
      return this.escape(s).replace(/"/g, "&quot;");
    }
  }

  document.querySelectorAll(".caption-widget").forEach(el => new CaptionWidget(el));
})();
