(function () {
  const DEFAULT_INFRA_URL = "https://infra-main.collibra.dev";

  var input = document.getElementById("defaultInfraUrl");
  var saveBtn = document.getElementById("save");
  var statusEl = document.getElementById("status");

  chrome.storage.local.get("defaultInfraUrl", function (data) {
    input.value = (data.defaultInfraUrl && data.defaultInfraUrl.trim()) || DEFAULT_INFRA_URL;
  });

  saveBtn.addEventListener("click", function () {
    var url = (input.value || "").trim() || DEFAULT_INFRA_URL;
    chrome.storage.local.set({ defaultInfraUrl: url }, function () {
      statusEl.textContent = "Saved.";
      setTimeout(function () {
        statusEl.textContent = "";
      }, 2000);
    });
  });
})();
