(function () {
  var MAX_INSTANCES = 3;
  var DEFAULT_INSTANCES = [
    { label: "infra-main", url: "https://infra-main.collibra.dev", color: "#0969da" },
  ];

  var container = document.getElementById("instances-container");
  var addBtn = document.getElementById("add-instance");
  var saveBtn = document.getElementById("save");
  var statusEl = document.getElementById("status");

  var PRESET_COLORS = ['#0969da', '#cf222e', '#1a7f37', '#9a6700', '#8250df', '#e16f24', '#0e8a8a', '#57606a'];

  function createColorPicker(selectedColor) {
    var wrap = document.createElement('div');
    wrap.className = 'color-picker';

    var chosen = selectedColor || PRESET_COLORS[0];

    // Trigger dot — shows the current color
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'color-trigger';
    trigger.style.background = chosen;
    trigger.setAttribute('data-color', chosen);

    // Dropdown with 8 swatches
    var dropdown = document.createElement('div');
    dropdown.className = 'color-dropdown';

    for (var i = 0; i < PRESET_COLORS.length; i++) {
      (function (c) {
        var swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch' + (c === chosen ? ' selected' : '');
        swatch.style.background = c;
        swatch.setAttribute('data-color', c);
        swatch.addEventListener('click', function (e) {
          e.stopPropagation();
          // Update trigger
          trigger.style.background = c;
          trigger.setAttribute('data-color', c);
          // Update selected swatch
          var prev = dropdown.querySelector('.color-swatch.selected');
          if (prev) prev.className = 'color-swatch';
          swatch.className = 'color-swatch selected';
          // Close dropdown
          dropdown.classList.remove('open');
        });
        dropdown.appendChild(swatch);
      })(PRESET_COLORS[i]);
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      // Close any other open dropdowns first
      var allOpen = document.querySelectorAll('.color-dropdown.open');
      for (var j = 0; j < allOpen.length; j++) {
        if (allOpen[j] !== dropdown) allOpen[j].classList.remove('open');
      }
      dropdown.classList.toggle('open');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);
    return wrap;
  }

  function createInstanceRow(instance) {
    var row = document.createElement('div');
    row.className = 'instance-row';

    var colorPicker = createColorPicker(instance && instance.color);

    var labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'label-input';
    labelInput.placeholder = 'Label';
    labelInput.value = (instance && instance.label) || '';

    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'url-input';
    urlInput.placeholder = 'https://infra-main.collibra.dev';
    urlInput.value = (instance && instance.url) || '';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '\u2715';
    removeBtn.addEventListener('click', function () {
      row.remove();
      updateAddButton();
    });

    row.appendChild(colorPicker);
    row.appendChild(labelInput);
    row.appendChild(urlInput);
    row.appendChild(removeBtn);
    return row;
  }

  function updateAddButton() {
    var count = container.querySelectorAll(".instance-row").length;
    addBtn.disabled = count >= MAX_INSTANCES;
  }

  function renderInstances(instances) {
    container.innerHTML = "";
    var list = instances && instances.length ? instances : DEFAULT_INSTANCES;
    for (var i = 0; i < list.length; i++) {
      container.appendChild(createInstanceRow(list[i]));
    }
    updateAddButton();
  }

  function collectInstances() {
    var rows = container.querySelectorAll(".instance-row");
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].querySelector(".label-input").value.trim();
      var url = rows[i].querySelector(".url-input").value.trim();
      var colorEl = rows[i].querySelector('.color-trigger');
      var color = colorEl ? colorEl.getAttribute('data-color') : '#0969da';
      if (url) {
        result.push({ label: label || url, url: url, color: color });
      }
    }
    return result;
  }

  addBtn.addEventListener("click", function () {
    var count = container.querySelectorAll(".instance-row").length;
    if (count < MAX_INSTANCES) {
      container.appendChild(createInstanceRow(null));
      updateAddButton();
    }
  });

  saveBtn.addEventListener("click", function () {
    var instances = collectInstances();
    if (instances.length === 0) {
      instances = DEFAULT_INSTANCES;
    }
    chrome.storage.local.set({ instances: instances }, function () {
      window.close();
    });
  });

  // Load saved instances
  chrome.storage.local.get("instances", function (data) {
    renderInstances(data.instances);
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', function () {
    var allOpen = document.querySelectorAll('.color-dropdown.open');
    for (var j = 0; j < allOpen.length; j++) {
      allOpen[j].classList.remove('open');
    }
  });
})();
