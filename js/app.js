/**
 * Industrial Map - основной файл логики приложения
 * Содержит: работу с картой, зум/панораму, отрисовку цехов и легенд,
 * массовое редактирование (лассо и Ctrl+клик), управление слоями и поиск.
 * Добавлены функции экспорта в PNG и Excel (обычный и настраиваемый).
 */

const state = {
    legends: [],
    legendTypes: [],
    colors: [],
    workshops: [],
    oneCBases: [],
    selectedLegendId: null,
    menuMode: 'layers',
    visibleTypes: new Set(),
    searchTimer: null,
    searchRequestId: 0,
    drag: null,
    multiSelect: new Set(),
    history: [],
    redoHistory: [],
    editMode: false,
    viewBox: { x: 0, y: 0, w: 2048, h: 1290 },
    drawingWorkshop: false,
    movingLabel: false,
    placingLegend: false,
    currentPoints: [],
    newWorkshopName: '',
    newWorkshopFontSize: 24,
    editingWorkshopId: null,
    isLassoing: false,
    lassoStart: null,
    lassoRect: null,
    isShowingCoords: false,
    isPanning: false,
    panStart: null,
    saving: false,
    lassoMoved: false
};

const NS = 'http://www.w3.org/2000/svg';

const els = {
    leftMenu: document.getElementById('leftMenu'),
    collapseMenuBtn: document.getElementById('collapseMenuBtn'),
    expandMenuBtn: document.getElementById('expandMenuBtn'),
    resizeHandle: document.getElementById('resizeHandle'),
    undoBtn: document.getElementById('undoBtn'),
    undoAllBtn: document.getElementById('undoAllBtn'),
    redoBtn: document.getElementById('redoBtn'),
    redoAllBtn: document.getElementById('redoAllBtn'),
    mapStage: document.getElementById('mapStage'),
    mapSvg: document.getElementById('mapSvg'),
    workshopLayer: document.getElementById('workshopLayer'),
    legendLayer: document.getElementById('legendLayer'),
    menuContent: document.getElementById('menuContent'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    layersBtn: document.getElementById('layersBtn'),
    addLegendBtn: document.getElementById('addLegendBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    toast: document.getElementById('toast'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomResetBtn: document.getElementById('zoomResetBtn'),
    zoomLevelInput: document.getElementById('zoomLevelInput'),
    editModeBtn: document.getElementById('editModeBtn'),
    lockIcon: document.getElementById('lockIcon'),
    unlockIcon: document.getElementById('unlockIcon'),
    coordsBtn: document.getElementById('coordsBtn'),
    coordsDisplay: document.getElementById('coordsDisplay'),
    coordsCrossX: document.getElementById('coordsCrossX'),
    coordsCrossY: document.getElementById('coordsCrossY')
};

// ============================================
// УПРАВЛЕНИЕ ПАНЕЛЬЮ
// ============================================

els.collapseMenuBtn.onclick = () => {
    els.leftMenu.classList.add('collapsed');
    els.collapseMenuBtn.style.display = 'none';
    els.expandMenuBtn.style.display = 'flex';
};

els.expandMenuBtn.onclick = () => {
    els.leftMenu.classList.remove('collapsed');
    els.collapseMenuBtn.style.display = 'flex';
    els.expandMenuBtn.style.display = 'none';
};

els.resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = els.leftMenu.offsetWidth;

    const onMouseMove = (e) => {
        const newWidth = startWidth + (e.clientX - startX);
        els.leftMenu.style.width =
            `${Math.max(300, Math.min(600, newWidth))}px`;
    };

    const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
});

// ============================================
// ЗУМ И ПАНОРАМИРОВАНИЕ КАРТЫ
// ============================================

function applyViewBox() {
    els.mapSvg.setAttribute(
        'viewBox',
        `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`
    );

    if (els.zoomLevelInput) {
        els.zoomLevelInput.value =
            (2048 / state.viewBox.w).toFixed(2);
    }
}

function zoomAtPoint(scaleFactor, clientX, clientY) {
    const rect = els.mapStage.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const oldW = state.viewBox.w;
    const oldH = state.viewBox.h;

    const newW = Math.min(
        2048 * 5,
        Math.max(2048 * 0.2, oldW / scaleFactor)
    );

    const newH = newW * (1290 / 2048);

    const ratioX = mouseX / rect.width;
    const ratioY = mouseY / rect.height;

    const centerX = state.viewBox.x + oldW * ratioX;
    const centerY = state.viewBox.y + oldH * ratioY;

    state.viewBox.w = newW;
    state.viewBox.h = newH;

    state.viewBox.x =
        centerX - newW * ratioX;

    state.viewBox.y =
        centerY - newH * ratioY;

    state.viewBox.x = clamp(
        state.viewBox.x,
        0,
        Math.max(0, 2048 - newW)
    );

    state.viewBox.y = clamp(
        state.viewBox.y,
        0,
        Math.max(0, 1290 - newH)
    );

    applyViewBox();
}

function handleWheel(e) {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
        zoomAtPoint(
            e.deltaY < 0 ? 1.1 : 0.9,
            e.clientX,
            e.clientY
        );
    }
}

function handlePanStart(e) {
    if (e.button === 2) {
        e.preventDefault();

        state.isPanning = true;

        state.panStart = {
            x: e.clientX,
            y: e.clientY,
            vbx: state.viewBox.x,
            vby: state.viewBox.y
        };
    }
}

function handlePanMove(e) {
    if (!state.isPanning) return;

    const rect = els.mapStage.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const dx =
        (e.clientX - state.panStart.x) *
        (state.viewBox.w / rect.width);

    const dy =
        (e.clientY - state.panStart.y) *
        (state.viewBox.h / rect.height);

    state.viewBox.x =
        state.panStart.vbx - dx;

    state.viewBox.y =
        state.panStart.vby - dy;

    state.viewBox.x = clamp(
        state.viewBox.x,
        0,
        Math.max(0, 2048 - state.viewBox.w)
    );

    state.viewBox.y = clamp(
        state.viewBox.y,
        0,
        Math.max(0, 1290 - state.viewBox.h)
    );

    applyViewBox();
}

function handlePanEnd() {
    state.isPanning = false;
}

// ============================================
// ИСТОРИЯ ДЕЙСТВИЙ (UNDO/REDO)
// ============================================

function pushHistory(snapshot) {
    state.history.push(snapshot);

    if (state.history.length > 20) {
        state.history.shift();
    }

    state.redoHistory = [];
}

async function syncLegendsToDB(targetLegends) {
    const currentLegends =
        Array.isArray(state.legends)
            ? state.legends
            : [];

    const target =
        Array.isArray(targetLegends)
            ? targetLegends
            : [];

    // Сначала удаляем то, чего нет в целевом состоянии.
    for (const current of currentLegends) {
        const exists = target.some(
            t => Number(t.id) === Number(current.id)
        );

        if (!exists && current.id != null) {
            await apiRequest('/legends/delete.php', {
                method: 'POST',
                body: {
                    id: current.id
                }
            });
        }
    }

    // Затем обновляем существующие и создаём отсутствующие.
    for (const legend of target) {
        const exists = currentLegends.some(
            t => Number(t.id) === Number(legend.id)
        );

        const payload = {
            name: String(
                legend.name || 'Legenda'
            ).trim(),

            legend_type_id:
                Number(legend.legend_type_id),

            color_id:
                Number(legend.color_id),

            x:
                Number(legend.x),

            y:
                Number(legend.y),

            width:
                Number(legend.width),

            height:
                Number(legend.height),

            border_width:
                Number(legend.border_width),

            shape:
                legend.shape || 'circle',

            workshop_id:
                findWorkshopId(
                    Number(legend.x),
                    Number(legend.y)
                ),

            // ВАЖНО:
            // [] тоже передаём.
            // Иначе удалённые базы 1С
            // оставались бы в БД.
            one_c_bases:
                Array.isArray(legend.one_c_bases)
                    ? legend.one_c_bases
                        .map(b => ({
                            one_c_base_id:
                                Number(
                                    b.one_c_base_id ??
                                    b.id
                                ),

                            installed_version:
                                String(
                                    b.installed_version ||
                                    ''
                                ).trim()
                        }))
                        .filter(
                            b =>
                                b.one_c_base_id &&
                                b.installed_version
                        )
                    : []
        };

        if (exists) {
            await apiRequest('/legends/update.php', {
                method: 'POST',
                body: {
                    ...payload,
                    id: legend.id
                }
            });
        } else {
            await apiRequest('/legends/create.php', {
                method: 'POST',
                body: payload
            });
        }
    }
}

async function undo() {
    if (!state.history.length) return;

    const prev = state.history.pop();

    state.redoHistory.push({
        legendsArray:
            JSON.parse(
                JSON.stringify(state.legends)
            )
    });

    try {
        await syncLegendsToDB(
            prev.legendsArray
        );

        state.legends =
            prev.legendsArray;

        await loadLegends();

        renderLayersMenu();

        showToast('Действие отменено');
    } catch (e) {
        showToast(
            e.message,
            true
        );
    }
}

async function undoAll() {
    if (!state.history.length) return;

    const first = state.history[0];

    state.history = [];

    state.redoHistory.push({
        legendsArray:
            JSON.parse(
                JSON.stringify(state.legends)
            )
    });

    try {
        await syncLegendsToDB(
            first.legendsArray
        );

        state.legends =
            first.legendsArray;

        await loadLegends();

        renderLayersMenu();

        showToast(
            'Все действия отменены'
        );
    } catch (e) {
        showToast(
            e.message,
            true
        );
    }
}

async function redo() {
    if (!state.redoHistory.length) return;

    const next =
        state.redoHistory.pop();

    state.history.push({
        legendsArray:
            JSON.parse(
                JSON.stringify(state.legends)
            )
    });

    try {
        await syncLegendsToDB(
            next.legendsArray
        );

        state.legends =
            next.legendsArray;

        await loadLegends();

        renderLayersMenu();

        showToast(
            'Действие возвращено'
        );
    } catch (e) {
        showToast(
            e.message,
            true
        );
    }
}

async function redoAll() {
    if (!state.redoHistory.length) return;

    // redoHistory хранится от самого нового состояния
    // к более старым.
    //
    // После нескольких undo первым элементом
    // является состояние, которое нужно восстановить
    // последним.
    const target =
        state.redoHistory[0];

    try {
        await syncLegendsToDB(
            target.legendsArray
        );

        state.legends =
            target.legendsArray;

        state.redoHistory = [];

        await loadLegends();

        renderLayersMenu();

        showToast(
            'Все действия возвращены'
        );
    } catch (e) {
        showToast(
            e.message,
            true
        );
    }
}

els.undoBtn.onclick = undo;
els.undoAllBtn.onclick = undoAll;
els.redoBtn.onclick = redo;
els.redoAllBtn.onclick = redoAll;

// ============================================
// ИНИЦИАЛИЗАЦИЯ И ЗАГРУЗКА ДАННЫХ
// ============================================

async function init() {
    console.log('INIT STARTED');

    try {
        await apiRequest(
            '/auth/me.php'
        );

        const [
            types,
            colors,
            workshops,
            bases
        ] = await Promise.all([
            apiRequest(
                '/legend-types/list.php'
            ),
            apiRequest(
                '/colors/list.php'
            ),
            apiRequest(
                '/workshops/list.php'
            ),
            apiRequest(
                '/one-c-bases/list.php'
            )
        ]);

        state.legendTypes = types;
        state.colors = colors;
        state.workshops = workshops;
        state.oneCBases = bases;

        state.visibleTypes =
            new Set(
                types.map(
                    t => Number(t.id)
                )
            );

        renderWorkshops();

        await loadLegends();

        renderLayersMenu();

        applyViewBox();

        initCoordinateOverlay();

        initExportButtons();
    } catch (e) {
        if (e.status === 401) {
            location.href = 'login.html';
        } else {
            showToast(
                e.message,
                true
            );
        }
    }
}

// ============================================
// РЕНДЕРИНГ ЦЕХОВ И НАДПИСЕЙ
// ============================================

function renderWorkshops() {
    els.workshopLayer.innerHTML = '';

    // Сначала полигоны зон.
    state.workshops.forEach(w => {
        const points =
            (w.points || [])
                .map(p => p.join(','))
                .join(' ');

        if (!points) return;

        const poly =
            document.createElementNS(
                NS,
                'polygon'
            );

        poly.setAttribute(
            'points',
            points
        );

        poly.classList.add(
            'workshop-hitbox'
        );

        poly.dataset.id = w.id;

        poly.style.fill =
            'rgba(0, 0, 0, 0)';

        poly.style.stroke =
            'rgba(0, 0, 0, 0)';

        poly.style.pointerEvents =
            'none';

        els.workshopLayer.appendChild(
            poly
        );
    });

    // Затем надписи.
    state.workshops.forEach(w => {
        const points =
            w.points || [];

        if (!points.length) return;

        let cx =
            parseFloat(w.label_x);

        let cy =
            parseFloat(w.label_y);

        if (
            isNaN(cx) ||
            isNaN(cy)
        ) {
            cx =
                points.reduce(
                    (sum, p) =>
                        sum +
                        parseFloat(p[0]),
                    0
                ) /
                points.length;

            cy =
                points.reduce(
                    (sum, p) =>
                        sum +
                        parseFloat(p[1]),
                    0
                ) /
                points.length;
        }

        const text =
            document.createElementNS(
                NS,
                'text'
            );

        text.classList.add(
            'workshop-label'
        );

        text.textContent =
            w.name;

        text.setAttribute(
            'x',
            cx
        );

        text.setAttribute(
            'y',
            cy
        );

        text.setAttribute(
            'font-size',
            w.font_size || 24
        );

        text.setAttribute(
            'text-anchor',
            'middle'
        );

        text.setAttribute(
            'dominant-baseline',
            'middle'
        );

        text.setAttribute(
            'stroke',
            '#ffffff'
        );

        text.setAttribute(
            'stroke-width',
            '3'
        );

        text.setAttribute(
            'paint-order',
            'stroke'
        );

        text.style.pointerEvents =
            'all';

        text.dataset.id =
            w.id;

        text.addEventListener(
            'click',
            e => {
                if (
                    e.ctrlKey ||
                    e.metaKey
                ) {
                    if (
                        state.editMode
                    ) {
                        openWorkshopEditor(
                            w.id
                        );
                    }

                    return;
                }

                zoomToWorkshop(
                    w.id
                );
            }
        );

        els.workshopLayer.appendChild(
            text
        );
    });
}

// ============================================
// ЗАГРУЗКА И РЕНДЕРИНГ ЛЕГЕНД
// ============================================

async function loadLegends(
    search = ''
) {
    state.legends =
        await apiRequest(
            '/legends/list.php',
            {
                query: {
                    search
                }
            }
        );

    renderLegends();
}

function renderLegends() {
    els.legendLayer.innerHTML = '';

    state.legends.forEach(l => {
        if (
            !state.visibleTypes.has(
                Number(l.legend_type_id)
            )
        ) {
            return;
        }

        const g =
            document.createElementNS(
                NS,
                'g'
            );

        g.classList.add(
            'legend'
        );

        g.dataset.id =
            l.id;

        g.dataset.typeId =
            l.legend_type_id;

        g.setAttribute(
            'transform',
            `translate(${l.x} ${l.y})`
        );

        // [ПРАВКА 1] Гарантированно применяем классы
        // после каждого вызова renderLegends
        const idNum = Number(l.id);
        if (state.multiSelect.has(idNum)) {
            g.classList.add('multi-selected');
        }

        if (Number(l.id) === state.selectedLegendId) {
            g.classList.add('selected');
        }

        const c =
            document.createElementNS(
                NS,
                'circle'
            );

        c.classList.add(
            'legend-body'
        );

        c.setAttribute(
            'r',
            Math.max(
                1,
                Math.min(
                    Number(l.width) || 64,
                    Number(l.height) || 64
                ) / 2
            )
        );

        c.setAttribute(
            'fill',
            l.color_hex
        );

        c.setAttribute(
            'stroke',
            '#00204a'
        );

        c.setAttribute(
            'stroke-width',
            Number(
                l.border_width
            ) || 0
        );

        const label =
            document.createElementNS(
                NS,
                'text'
            );

        label.classList.add(
            'legend-code'
        );

        label.textContent =
            l.type_code || '';

        label.setAttribute(
            'y',
            5
        );

        const name =
            document.createElementNS(
                NS,
                'text'
            );

        name.classList.add(
            'legend-name'
        );

        name.textContent =
            l.name;

        name.setAttribute(
            'x',
            Math.min(
                Number(l.width) || 64,
                Number(l.height) || 64
            ) / 2 + 7
        );

        name.setAttribute(
            'y',
            4
        );

        g.append(
            c,
            label,
            name
        );

        els.legendLayer.appendChild(
            g
        );

        // [ПРАВКА 2] Убрана сложная логика из click,
        // теперь всё обрабатывается в pointerdown.
        // Событие click мы игнорируем полностью.
        g.addEventListener('pointerdown', e => {
            if (!state.editMode) {
                // Просмотр
                if (e.ctrlKey || e.metaKey) {
                    // В режиме просмотра Ctrl+клик просто выделяет
                    handleLegendMultiSelect(Number(l.id));
                } else {
                    selectLegend(l.id);
                    openLegendCard(l.id);
                }
            } else {
                // Редактирование
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+клик - мультиселект
                    e.preventDefault();
                    e.stopPropagation();
                    handleLegendMultiSelect(Number(l.id));
                } else if (e.button === 0) {
                    // Обычный клик - перетаскивание
                    beginDrag(e, g, l);
                }
            }
        });
    });

    applySearchHighlight();
}

// [НОВАЯ ФУНКЦИЯ] Единая логика для мультиселекта
function handleLegendMultiSelect(id) {
    const idNum = Number(id);
    if (state.multiSelect.has(idNum)) {
        state.multiSelect.delete(idNum);
    } else {
        state.multiSelect.add(idNum);
    }

    // Обновляем selectedLegendId
    state.selectedLegendId = idNum;

    // Полностью перерисовываем легенды для применения классов
    renderLegends();

    if (state.multiSelect.size > 1) {
        renderMassEditMenu();
    } else if (state.multiSelect.size === 1) {
        openLegendCard(idNum);
    } else {
        // Если ничего не выбрано, возвращаемся в меню слоёв
        renderLayersMenu();
    }
}

function selectLegend(id) {
    state.selectedLegendId =
        Number(id);

    document
        .querySelectorAll(
            '.legend'
        )
        .forEach(el => {
            el.classList.toggle(
                'selected',
                Number(
                    el.dataset.id
                ) ===
                state.selectedLegendId
            );
        });
}

// ============================================
// КАРТОЧКА ЛЕГЕНДЫ И РЕДАКТОР
// ============================================

async function openLegendCard(id) {
    const l =
        await apiRequest(
            '/legends/get.php',
            {
                query: {
                    id
                }
            }
        );

    state.menuMode =
        'legend';

    selectLegend(id);

    const bases =
        Array.isArray(
            l.one_c_bases
        )
            ? l.one_c_bases
            : [];

    els.menuContent.innerHTML = `
        <h3>${esc(l.name)}</h3>

        <p>
            <b>Вид:</b>
            ${esc(l.type_name || l.type_code || '')}
        </p>

        <p>
            <b>Цех:</b>
            ${esc(
        l.workshop_name ||
        'Не определён'
    )}
        </p>

        <p>
            <b>Координаты:</b>
            ${Number(l.x).toFixed(1)},
            ${Number(l.y).toFixed(1)}
        </p>

        <p>
            <b>Размер:</b>
            ${l.width} × ${l.height}
        </p>

        <p>
            <b>Толщина обводки:</b>
            ${l.border_width}
        </p>

        <p>
            <b>Цвет:</b>
            <span
                class="color-chip"
                style="background:${esc(
        l.color_hex || ''
    )}"
            ></span>
            ${esc(
        l.color_name || ''
    )}
        </p>

        <h4>Базы 1С</h4>

        <div>
            ${bases.length
            ? bases
                .map(
                    b =>
                        `<div>
                                    • ${esc(
                            b.name
                        )}
                                    —
                                    ${esc(
                            b.installed_version ||
                            ''
                        )}
                                </div>`
                )
                .join('')
            : '<span class="muted">Не указаны</span>'
        }
        </div>

        <div class="menu-toolbar actions">
            <button
                class="btn btn-primary"
                id="editLegendBtn"
            >
                Редактировать
            </button>

            <button
                class="btn btn-danger"
                id="deleteLegendBtn"
            >
                Удалить
            </button>
        </div>
    `;

    document
        .getElementById(
            'editLegendBtn'
        )
        .onclick = () =>
            renderLegendEditor(l);

    document
        .getElementById(
            'deleteLegendBtn'
        )
        .onclick = () =>
            deleteLegend(l.id);
}

function renderLegendEditor(
    l,
    isNew = false
) {
    state.menuMode =
        isNew
            ? 'add'
            : 'edit';

    const typeOptions =
        state.legendTypes
            .map(
                t =>
                    `<option
                        value="${t.id}"
                        ${Number(t.id) ===
                        Number(
                            l.legend_type_id
                        )
                        ? 'selected'
                        : ''
                    }
                    >
                        ${esc(t.name)}
                    </option>`
            )
            .join('');

    const colorOptions =
        state.colors
            .map(
                c =>
                    `<option
                        value="${c.id}"
                        ${Number(c.id) ===
                        Number(l.color_id)
                        ? 'selected'
                        : ''
                    }
                    >
                        ${esc(c.name)}
                        (${esc(c.hex_code)})
                    </option>`
            )
            .join('');

    els.menuContent.innerHTML = `
        <h3>
            ${isNew
            ? 'Добавление легенды'
            : 'Редактирование легенды'
        }
        </h3>

        <div class="form-grid">

            <div class="field field-wide">
                <label>
                    Имя / идентификатор
                </label>

                <input
                    id="legendName"
                    value="${attr(
            l.name || ''
        )}"
                    maxlength="200"
                >
            </div>

            <div class="field">
                <label>Вид</label>

                <select id="legendType">
                    ${typeOptions}
                </select>
            </div>

            <div class="field">
                <label>Цвет</label>

                <select id="legendColor">
                    ${colorOptions}
                </select>
            </div>

            <div class="field">
                <label>Размер</label>

                <input
                    id="legendSize"
                    type="number"
                    min="20"
                    value="${l.width || 64}"
                >
            </div>

            <div class="field">
                <label>
                    Толщина обводки
                </label>

                <input
                    id="legendBorder"
                    type="number"
                    min="0"
                    step="0.5"
                    value="${l.border_width || 3.2
        }"
                >
            </div>

            <div class="field">
                <label>X</label>

                <input
                    id="legendX"
                    type="number"
                    step="0.1"
                    value="${l.x ?? 1024
        }"
                >
            </div>

            <div class="field">
                <label>Y</label>

                <input
                    id="legendY"
                    type="number"
                    step="0.1"
                    value="${l.y ?? 645
        }"
                >
            </div>

        </div>

        <p class="hint">
            При добавлении легенды можно
            поставить её прямо мышью:
            нажмите «Поставить на карту»,
            затем щёлкните нужное место.
        </p>

        <div class="bases">

            <h4>Базы 1С</h4>

            <div id="baseRows"></div>

            <button
                class="btn"
                id="addBaseBtn"
                type="button"
            >
                + Добавить базу
            </button>

        </div>

        <div class="menu-toolbar actions">

            <button
                class="btn btn-primary"
                id="saveLegendBtn"
            >
                ${isNew
            ? 'Создать'
            : 'Сохранить'
        }
            </button>

            <button
                class="btn"
                id="placeLegendBtn"
            >
                Поставить на карту
            </button>

            <button
                class="btn"
                id="cancelLegendBtn"
            >
                Отмена
            </button>

        </div>
    `;

    const rows =
        document.getElementById(
            'baseRows'
        );

    (
        l.one_c_bases || []
    ).forEach(
        b =>
            addBaseRow(
                rows,
                b
            )
    );

    document
        .getElementById(
            'addBaseBtn'
        )
        .onclick = () =>
            addBaseRow(rows);

    document
        .getElementById(
            'legendType'
        )
        .onchange = e => {

            if (isNew) {

                const t =
                    state.legendTypes.find(
                        x =>
                            Number(x.id) ===
                            Number(
                                e.target.value
                            )
                    );

                if (
                    t &&
                    t.default_color_id
                ) {
                    document
                        .getElementById(
                            'legendColor'
                        )
                        .value =
                        t.default_color_id;
                }
            }
        };

    document
        .getElementById(
            'placeLegendBtn'
        )
        .onclick =
        () =>
            startMapPlacement();

    document
        .getElementById(
            'saveLegendBtn'
        )
        .onclick =
        async () => {

            if (state.saving) return;

            try {

                const p =
                    collectLegendForm();

                validateLegendForm(
                    p
                );

                p.workshop_id =
                    findWorkshopId(
                        p.x,
                        p.y
                    );

                state.saving = true;

                // [ПРАВКА] Историю записываем ДО операции,
                // чтобы после неё можно было откатить изменения.
                const before = {
                    legendsArray:
                        JSON.parse(
                            JSON.stringify(
                                state.legends
                            )
                        )
                };

                if (isNew) {

                    const r =
                        await apiRequest(
                            '/legends/create.php',
                            {
                                method: 'POST',
                                body: p
                            }
                        );

                    // [ПРАВКА] Убедимся, что запись в историю происходит
                    // сразу после успешного создания.
                    pushHistory(
                        before
                    );

                    await loadLegends();

                    state.multiSelect.clear();

                    state.selectedLegendId =
                        Number(
                            r.id
                        );

                    showToast(
                        'Легенда создана.'
                    );

                    await openLegendCard(
                        r.id
                    );

                } else {

                    p.id =
                        l.id;

                    await apiRequest(
                        '/legends/update.php',
                        {
                            method: 'POST',
                            body: p
                        }
                    );

                    // [ПРАВКА] Убедимся, что запись в историю происходит
                    // сразу после успешного редактирования.
                    pushHistory(
                        before
                    );

                    await loadLegends();

                    state.multiSelect.clear();

                    state.selectedLegendId =
                        Number(
                            l.id
                        );

                    showToast(
                        'Легенда сохранена.'
                    );

                    await openLegendCard(
                        l.id
                    );
                }

            } catch (e) {

                showToast(
                    e.message,
                    true
                );

            } finally {

                state.saving = false;
            }
        };

    document
        .getElementById(
            'cancelLegendBtn'
        )
        .onclick = () => {

            if (l.id) {
                openLegendCard(
                    l.id
                );
            } else {
                renderLayersMenu();
            }
        };
}

function addBaseRow(
    c,
    b = {}
) {
    const row =
        document.createElement(
            'div'
        );

    row.className =
        'base-row';

    row.innerHTML = `
        <select class="base-id">

            <option value="">
                Выберите базу
            </option>

            ${state.oneCBases
            .map(
                x =>
                    `<option
                                value="${x.id}"
                                ${Number(x.id) ===
                        Number(
                            b.one_c_base_id ??
                            b.id
                        )
                        ? 'selected'
                        : ''
                    }
                            >
                                ${esc(x.name)}
                            </option>`
            )
            .join('')
        }

        </select>

        <input
            class="base-version"
            placeholder="Версия"
            value="${attr(
            b.installed_version || ''
        )}"
        >

        <button
            class="btn"
            type="button"
        >
            Удалить
        </button>
    `;

    row.querySelector(
        'button'
    ).onclick = () =>
            row.remove();

    c.appendChild(row);
}

function collectLegendForm() {
    const baseRows =
        Array.from(
            document.querySelectorAll(
                '#baseRows .base-row'
            )
        );

    return {
        name:
            document
                .getElementById(
                    'legendName'
                )
                .value
                .trim(),

        legend_type_id:
            Number(
                document.getElementById(
                    'legendType'
                ).value
            ),

        color_id:
            Number(
                document.getElementById(
                    'legendColor'
                ).value
            ),

        x:
            Number(
                document.getElementById(
                    'legendX'
                ).value
            ),

        y:
            Number(
                document.getElementById(
                    'legendY'
                ).value
            ),

        width:
            Number(
                document.getElementById(
                    'legendSize'
                ).value
            ),

        height:
            Number(
                document.getElementById(
                    'legendSize'
                ).value
            ),

        border_width:
            Number(
                document.getElementById(
                    'legendBorder'
                ).value
            ),

        shape:
            'circle',

        one_c_bases:
            baseRows.map(
                r => ({
                    one_c_base_id:
                        Number(
                            r.querySelector(
                                '.base-id'
                            ).value
                        ),

                    installed_version:
                        r.querySelector(
                            '.base-version'
                        ).value.trim()
                })
            )
    };
}

function validateLegendForm(p) {

    if (!p.name) {
        throw new Error(
            'Укажите имя / идентификатор легенды.'
        );
    }

    if (
        !Number.isInteger(
            p.legend_type_id
        ) ||
        p.legend_type_id <= 0
    ) {
        throw new Error(
            'Выберите вид оборудования.'
        );
    }

    if (
        !Number.isInteger(
            p.color_id
        ) ||
        p.color_id <= 0
    ) {
        throw new Error(
            'Выберите цвет.'
        );
    }

    if (
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y)
    ) {
        throw new Error(
            'Координаты X и Y должны быть числами.'
        );
    }

    if (
        !Number.isFinite(p.width) ||
        p.width < 20
    ) {
        throw new Error(
            'Размер легенды должен быть не меньше 20.'
        );
    }

    if (
        !Number.isFinite(
            p.border_width) ||
        p.border_width < 0
    ) {
        throw new Error(
            'Толщина обводки не может быть отрицательной.'
        );
    }

    const seenBases =
        new Set();

    for (
        const base
        of p.one_c_bases
    ) {

        if (
            !base.one_c_base_id &&
            !base.installed_version
        ) {
            continue;
        }

        if (
            !base.one_c_base_id ||
            !base.installed_version
        ) {
            throw new Error(
                'Для каждой базы 1С нужно указать и базу, и версию.'
            );
        }

        if (
            seenBases.has(
                base.one_c_base_id
            )
        ) {
            throw new Error(
                'Одна и та же база 1С не может быть добавлена дважды.'
            );
        }

        seenBases.add(
            base.one_c_base_id
        );
    }

    p.one_c_bases =
        p.one_c_bases.filter(
            b =>
                b.one_c_base_id &&
                b.installed_version
        );
}

function startMapPlacement() {
    state.placingLegend =
        true;

    els.mapStage.classList.add(
        'placing'
    );

    showToast(
        'Щёлкните по карте для установки легенды'
    );
}

// ============================================
// ПЕРЕТАСКИВАНИЕ ЛЕГЕНД
// ============================================

async function saveLegend(l) {

    return apiRequest(
        '/legends/update.php',
        {
            method: 'POST',

            body: {
                id: l.id,

                name:
                    l.name,

                legend_type_id:
                    Number(
                        l.legend_type_id
                    ),

                color_id:
                    Number(
                        l.color_id
                    ),

                x:
                    Number(l.x),

                y:
                    Number(l.y),

                width:
                    Number(l.width),

                height:
                    Number(l.height),

                border_width:
                    Number(
                        l.border_width
                    ),

                shape:
                    l.shape ||
                    'circle',

                workshop_id:
                    findWorkshopId(
                        Number(l.x),
                        Number(l.y)
                    ),

                one_c_bases:
                    Array.isArray(
                        l.one_c_bases
                    )
                        ? l.one_c_bases
                        : []
            }
        }
    );
}

async function deleteLegend(id) {

    if (
        !confirm(
            'Удалить выбранную легенду?'
        )
    ) {
        return;
    }

    const before = {
        legendsArray:
            JSON.parse(
                JSON.stringify(
                    state.legends
                )
            )
    };

    try {

        await apiRequest(
            '/legends/delete.php',
            {
                method: 'POST',
                body: {
                    id
                }
            }
        );

        pushHistory(
            before
        );

        state.multiSelect.delete(
            Number(id)
        );

        if (
            Number(
                state.selectedLegendId
            ) === Number(id)
        ) {
            state.selectedLegendId =
                null;
        }

        await loadLegends();

        renderLayersMenu();

        showToast(
            'Легенда удалена.'
        );

    } catch (e) {

        // После частично выполненной операции
        // состояние перечитываем с сервера.
        try {
            await loadLegends();
        } catch (_) { }

        renderLayersMenu();

        showToast(
            e.message,
            true
        );
    }
}

function beginDrag(
    e,
    g,
    l
) {

    if (!state.editMode) return;

    if (e.button !== 0) return;

    // ========================================
    // Ctrl+клик в режиме редактирования —
    // именно выделение, а не drag.
    // ========================================

    if (
        e.ctrlKey ||
        e.metaKey
    ) {

        e.preventDefault();
        e.stopPropagation();

        const id =
            Number(l.id);

        if (
            state.multiSelect.has(id)
        ) {
            state.multiSelect.delete(
                id
            );
        } else {
            state.multiSelect.add(
                id
            );
        }

        state.selectedLegendId =
            id;

        renderLegends();

        if (
            state.multiSelect.size > 1
        ) {
            renderMassEditMenu();
        } else if (
            state.multiSelect.size === 1
        ) {
            openLegendCard(id);
        } else {
            renderLayersMenu();
        }

        return;
    }

    e.preventDefault();

    // Обычный клик по объекту
    // снимает предыдущее массовое выделение.
    if (
        state.multiSelect.size
    ) {

        state.multiSelect.clear();

        document
            .querySelectorAll(
                '.legend'
            )
            .forEach(
                el =>
                    el.classList.remove(
                        'multi-selected'
                    )
            );
    }

    const p =
        screenToMap(
            e.clientX,
            e.clientY
        );

    const original = {
        x:
            Number(l.x),

        y:
            Number(l.y)
    };

    state.drag = {
        legend: l,
        group: g,

        startX:
            p.x,

        startY:
            p.y,

        originalX:
            original.x,

        originalY:
            original.y,

        moved:
            false
    };

    g.classList.add(
        'dragging'
    );

    const move = ev => {

        if (!state.drag) return;

        const point =
            screenToMap(
                ev.clientX,
                ev.clientY
            );

        l.x =
            clamp(
                point.x,
                0,
                MAP_CONFIG.width
            );

        l.y =
            clamp(
                point.y,
                0,
                MAP_CONFIG.height
            );

        if (
            Math.abs(
                l.x -
                state.drag.originalX
            ) +
            Math.abs(
                l.y -
                state.drag.originalY
            ) > 2
        ) {
            state.drag.moved =
                true;
        }

        g.setAttribute(
            'transform',
            `translate(${l.x} ${l.y})`
        );
    };

    const end = async () => {

        if (!state.drag) return;

        const cur =
            state.drag;

        state.drag = null;

        g.classList.remove(
            'dragging'
        );

        window.removeEventListener(
            'pointermove',
            move
        );

        window.removeEventListener(
            'pointerup',
            end
        );

        if (!cur.moved) {

            selectLegend(
                l.id
            );

            await openLegendCard(
                l.id
            );

            return;
        }

        const before = {
            legendsArray:
                JSON.parse(
                    JSON.stringify(
                        state.legends
                    )
                )
        };

        l.workshop_id =
            findWorkshopId(
                Number(l.x),
                Number(l.y)
            );

        try {

            await saveLegend(l);

            pushHistory(
                before
            );

          
            const index = state.legends.findIndex(item => Number(item.id) === Number(l.id));
            if (index !== -1) {
                state.legends[index] = l;
            }

            selectLegend(
                l.id
            );

            showToast(
                `Положение сохранено. ${getWorkshopName(
                    l.workshop_id
                )}`
            );

        } catch (err) {

            l.x =
                cur.originalX;

            l.y =
                cur.originalY;

            g.setAttribute(
                'transform',
                `translate(${l.x} ${l.y})`
            );

            showToast(
                err.message,
                true
            );
        }
    };

    window.addEventListener(
        'pointermove',
        move
    );

    window.addEventListener(
        'pointerup',
        end
    );
}

// ============================================
// ГЕОМЕТРИЧЕСКИЕ ФУНКЦИИ
// ============================================

function screenToMap(
    x,
    y
) {
    const ctm =
        els.mapSvg.getScreenCTM();

    if (!ctm) {
        return {
            x: 0,
            y: 0
        };
    }

    const screenPoint =
        new DOMPoint(
            x,
            y
        );

    const svgPoint =
        screenPoint.matrixTransform(
            ctm.inverse()
        );

    return {
        x: svgPoint.x,
        y: svgPoint.y
    };
}

function findWorkshopId(
    x,
    y
) {

    for (
        const w
        of state.workshops
    ) {

        const local =
            w.points || [];

        if (
            local.length > 0 &&
            pointInPolygon(
                x,
                y,
                local
            )
        ) {
            return Number(
                w.id
            );
        }
    }

    let best = null;
    let bd = Infinity;

    (
        MAP_CONFIG.workshopCenters ||
        []
    ).forEach(c => {

        const d =
            Math.hypot(
                x - c.x,
                y - c.y
            );

        if (d < bd) {
            bd = d;
            best = c.id;
        }
    });

    return best;
}

function pointInPolygon(
    x,
    y,
    pts
) {

    let inside = false;

    for (
        let i = 0,
        j = pts.length - 1;

        i < pts.length;

        j = i++
    ) {

        const xi =
            pts[i][0];

        const yi =
            pts[i][1];

        const xj =
            pts[j][0];

        const yj =
            pts[j][1];

        if (
            (
                (yi > y) !==
                (yj > y)
            ) &&
            (
                x <
                (
                    (xj - xi) *
                    (y - yi)
                ) /
                (
                    (yj - yi) ||
                    Number.EPSILON
                ) +
                xi
            )
        ) {
            inside =
                !inside;
        }
    }

    return inside;
}

function zoomToWorkshop(
    id
) {

    const w =
        state.workshops.find(
            x =>
                Number(x.id) ===
                Number(id)
        );

    if (!w) return;

    const points =
        w.points || [];

    if (!points.length) return;

    const cx =
        points.reduce(
            (sum, p) =>
                sum +
                parseFloat(p[0]),
            0
        ) /
        points.length;

    const cy =
        points.reduce(
            (sum, p) =>
                sum +
                parseFloat(p[1]),
            0
        ) /
        points.length;

    state.viewBox.w =
        1024;

    state.viewBox.h =
        645;

    state.viewBox.x =
        cx -
        state.viewBox.w / 2;

    state.viewBox.y =
        cy -
        state.viewBox.h / 2;

    state.viewBox.x =
        clamp(
            state.viewBox.x,
            0,
            2048 -
            state.viewBox.w
        );

    state.viewBox.y =
        clamp(
            state.viewBox.y,
            0,
            1290 -
            state.viewBox.h
        );

    applyViewBox();
}

function zoomToPoint(
    x,
    y
) {

    state.viewBox.w =
        512;

    state.viewBox.h =
        322;

    state.viewBox.x =
        x -
        state.viewBox.w / 2;

    state.viewBox.y =
        y -
        state.viewBox.h / 2;

    state.viewBox.x =
        clamp(
            state.viewBox.x,
            0,
            2048 -
            state.viewBox.w
        );

    state.viewBox.y =
        clamp(
            state.viewBox.y,
            0,
            1290 -
            state.viewBox.h
        );

    applyViewBox();
}

// ============================================
// МЕНЮ СЛОЕВ
// ============================================

function renderLayersMenu() {

    state.menuMode =
        'layers';

    const allVisible =
        state.visibleTypes.size ===
        state.legendTypes.length;

    els.menuContent.innerHTML = `
        <h3>Слои</h3>

        <div class="layer-list">

            <label
                class="layer-item all-layers-toggle"
            >
                <input
                    type="checkbox"
                    id="allLayersCheckbox"
                    ${allVisible
            ? 'checked'
            : ''
        }
                >

                <span
                    style="font-weight:bold;"
                >
                    Все слои
                </span>
            </label>

            ${state.legendTypes
            .map(
                t =>
                    `<label
                                class="layer-item"
                            >
                                <input
                                    type="checkbox"
                                    data-type-id="${t.id}"
                                    ${state.visibleTypes.has(
                        Number(
                            t.id
                        )
                    )
                        ? 'checked'
                        : ''
                    }
                                >

                                <span>
                                    ${esc(
                        t.name
                    )}
                                </span>
                            </label>`
            )
            .join('')
        }

        </div>

        <h4>
            Цеха / зоны
        </h4>

        <div
            class="workshop-list"
        >
            <select
                class="workshop-select"
                id="workshopSelect"
            >

                <option value="">
                    -- Выберите цех --
                </option>

                ${state.workshops
            .map(
                w =>
                    `<option
                                    value="${w.id}"
                                >
                                    ${esc(
                        w.name
                    )}
                                </option>`
            )
            .join('')
        }

            </select>
        </div>

        <div
            class="menu-toolbar"
        >
            <button
                class="btn btn-primary"
                id="createWorkshopBtn"
            >
                + Создать цех
            </button>
        </div>
    `;

    const workshopSelect =
        document.getElementById(
            'workshopSelect'
        );

    workshopSelect.onchange =
        () => {

            if (
                workshopSelect.value
            ) {
                zoomToWorkshop(
                    workshopSelect.value
                );
            }

            workshopSelect.value =
                '';
        };

    document
        .getElementById(
            'createWorkshopBtn'
        )
        .onclick = () => {

            els.menuContent.innerHTML = `
                <h3>
                    Создать цех
                </h3>

                <div class="form-grid">

                    <div class="field">
                        <label>
                            Название:
                        </label>

                        <input
                            id="newWorkshopNameInput"
                            type="text"
                            placeholder="Название цеха"
                            maxlength="150"
                        >
                    </div>

                    <div class="field">
                        <label>
                            Размер шрифта:
                        </label>

                        <input
                            id="newWorkshopFontInput"
                            type="number"
                            min="10"
                            max="200"
                            value="24"
                        >
                    </div>

                </div>

                <div
                    class="menu-toolbar actions"
                >

                    <button
                        class="btn btn-primary"
                        id="drawWorkshopBtn"
                    >
                        Начать рисовать
                    </button>

                    <button
                        class="btn"
                        id="cancelWorkshopBtn"
                    >
                        Отмена
                    </button>

                </div>
            `;

            document
                .getElementById(
                    'drawWorkshopBtn'
                )
                .onclick = () => {

                    state.newWorkshopName =
                        document
                            .getElementById(
                                'newWorkshopNameInput'
                            )
                            .value
                            .trim();

                    state.newWorkshopFontSize =
                        Number(
                            document
                                .getElementById(
                                    'newWorkshopFontInput'
                                )
                                .value
                        );

                    if (
                        !state.newWorkshopName
                    ) {
                        showToast(
                            'Укажите название цеха.',
                            true
                        );
                        return;
                    }

                    if (
                        !Number.isFinite(
                            state.newWorkshopFontSize
                        ) ||
                        state.newWorkshopFontSize < 10
                    ) {
                        showToast(
                            'Размер шрифта должен быть не меньше 10.',
                            true
                        );
                        return;
                    }

                    state.drawingWorkshop =
                        true;

                    state.movingLabel =
                        false;

                    state.editingWorkshopId =
                        null;

                    state.currentPoints =
                        [];

                    showToast(
                        'Кликайте по карте для добавления точек. Enter — сохранить, ESC — отменить.'
                    );
                };

            document
                .getElementById(
                    'cancelWorkshopBtn'
                )
                .onclick = () => {

                    cancelWorkshopDrawing();

                    state.editingWorkshopId =
                        null;

                    renderLayersMenu();

                    showToast(
                        'Создание отменено'
                    );
                };
        };

    const allCheckbox =
        document.getElementById(
            'allLayersCheckbox'
        );

    allCheckbox.onchange =
        () => {

            if (
                allCheckbox.checked
            ) {

                state.visibleTypes =
                    new Set(
                        state.legendTypes.map(
                            t =>
                                Number(
                                    t.id
                                )
                        )
                    );

            } else {

                state.visibleTypes.clear();
            }

            renderLegends();
            renderLayersMenu();
        };

    els.menuContent
        .querySelectorAll(
            'input[data-type-id]'
        )
        .forEach(
            i => {

                i.onchange = () => {

                    const id =
                        Number(
                            i.dataset.typeId
                        );

                    if (
                        i.checked
                    ) {
                        state.visibleTypes.add(
                            id
                        );
                    } else {
                        state.visibleTypes.delete(
                            id
                        );
                    }

                    renderLegends();
                    renderLayersMenu();
                };
            }
        );
}

function getWorkshopName(
    id
) {

    return id
        ? (
            state.workshops.find(
                w =>
                    Number(w.id) ===
                    Number(id)
            )?.name ||
            'цех не определён'
        )
        : 'цех не определён';
}

// ============================================
// ПОИСК И ПОДСВЕТКА
// ============================================

function applySearchHighlight() {

    document
        .querySelectorAll(
            '.legend'
        )
        .forEach(
            e =>
                e.classList.remove(
                    'highlighted'
                )
        );

    const q =
        els.searchInput.value.trim();

    if (!q) return;

    const query =
        q.toLowerCase();

    const foundIds =
        new Set();

    state.legends.forEach(
        l => {

            const matchName =
                String(
                    l.name || ''
                )
                    .toLowerCase()
                    .includes(
                        query
                    );

            const matchCode =
                String(
                    l.type_code || ''
                )
                    .toLowerCase()
                    .includes(
                        query
                    );

            const matchWorkshop =
                String(
                    l.workshop_name || ''
                )
                    .toLowerCase()
                    .includes(
                        query
                    );

            if (
                matchName ||
                matchCode ||
                matchWorkshop
            ) {
                foundIds.add(
                    Number(l.id)
                );
            }
        }
    );

    document
        .querySelectorAll(
            '.legend'
        )
        .forEach(
            e => {

                if (
                    foundIds.has(
                        Number(
                            e.dataset.id
                        )
                    )
                ) {
                    e.classList.add(
                        'highlighted'
                    );
                }
            }
        );

    if (
        foundIds.size === 1
    ) {

        const foundId =
            Array.from(
                foundIds
            )[0];

        const foundLegend =
            state.legends.find(
                l =>
                    Number(l.id) ===
                    foundId
            );

        if (
            foundLegend
        ) {

            zoomToPoint(
                Number(
                    foundLegend.x
                ),
                Number(
                    foundLegend.y
                )
            );

            openLegendCard(
                foundId
            );
        }

    } else if (
        foundIds.size > 1
    ) {

        const workshopCounts =
            {};

        state.legends.forEach(
            l => {

                if (
                    foundIds.has(
                        Number(l.id)
                    ) &&
                    l.workshop_id
                ) {

                    workshopCounts[
                        l.workshop_id
                    ] =
                        (
                            workshopCounts[
                            l.workshop_id
                            ] ||
                            0
                        ) + 1;
                }
            }
        );

        let bestWorkshopId =
            null;

        let bestCount =
            0;

        for (
            const [
                id,
                count
            ]
            of Object.entries(
                workshopCounts
            )
        ) {

            if (
                count >
                bestCount
            ) {

                bestCount =
                    count;

                bestWorkshopId =
                    id;
            }
        }

        if (
            bestWorkshopId
        ) {

            zoomToWorkshop(
                Number(
                    bestWorkshopId
                )
            );
        }

    } else {

        const matchedWorkshop =
            state.workshops.find(
                w =>
                    String(
                        w.name || ''
                    )
                        .toLowerCase()
                        .includes(
                            query
                        )
            );

        if (
            matchedWorkshop
        ) {

            zoomToWorkshop(
                matchedWorkshop.id
            );
        }
    }
}

// ============================================
// РЕДАКТИРОВАНИЕ ЦЕХОВ
// ============================================

function startWorkshopDrawing() {

    state.drawingWorkshop =
        true;

    state.movingLabel =
        false;

    state.currentPoints =
        [];

    const tempPoly =
        els.workshopLayer
            .querySelector(
                '.temp-polygon'
            );

    if (tempPoly) {
        tempPoly.remove();
    }

    showToast(
        'Кликайте по карте для добавления точек зоны. Enter — сохранить, ESC — отменить.'
    );
}

function startMoveLabel(
    id
) {

    state.movingLabel =
        true;

    state.drawingWorkshop =
        false;

    state.editingWorkshopId =
        id;

    showToast(
        'Кликните по карте, чтобы переместить надпись.'
    );
}

function cancelWorkshopDrawing() {

    state.drawingWorkshop =
        false;

    state.movingLabel =
        false;

    state.currentPoints =
        [];

    state.lassoMoved =
        false;

    const tempPoly =
        els.workshopLayer
            .querySelector(
                '.temp-polygon'
            );

    if (tempPoly) {
        tempPoly.remove();
    }

    els.mapStage.classList.remove(
        'placing'
    );
}

async function handleMapClickForWorkshop(
    e
) {

    if (
        !state.drawingWorkshop &&
        !state.movingLabel
    ) {
        return;
    }

    const p =
        screenToMap(
            e.clientX,
            e.clientY
        );

    if (
        state.movingLabel &&
        state.editingWorkshopId
    ) {

        const w =
            state.workshops.find(
                x =>
                    Number(x.id) ===
                    Number(
                        state.editingWorkshopId
                    )
            );

        if (w) {

            const oldX =
                w.label_x;

            const oldY =
                w.label_y;

            w.label_x =
                p.x;

            w.label_y =
                p.y;

            state.movingLabel =
                false;

            try {

                await saveMovedLabel(
                    state.editingWorkshopId,
                    p.x,
                    p.y
                );

                showToast(
                    'Надпись перемещена'
                );

            } catch (_) {

                w.label_x =
                    oldX;

                w.label_y =
                    oldY;

                state.movingLabel =
                    true;

                return;
            }

            renderWorkshops();

            return;
        }
    }

    state.currentPoints.push(
        [
            p.x,
            p.y
        ]
    );

    drawCurrentPolygon();
}

function drawCurrentPolygon() {

    const tempPoly =
        els.workshopLayer
            .querySelector(
                '.temp-polygon'
            );

    if (tempPoly) {
        tempPoly.remove();
    }

    if (
        state.currentPoints.length <
        2
    ) {
        return;
    }

    const pointsStr =
        state.currentPoints
            .map(
                pt =>
                    pt.join(',')
            )
            .join(' ');

    const poly =
        document.createElementNS(
            NS,
            'polygon'
        );

    poly.setAttribute(
        'points',
        pointsStr
    );

    poly.classList.add(
        'temp-polygon'
    );

    poly.style.stroke =
        'red';

    poly.style.strokeWidth =
        '2';

    poly.style.fill =
        'rgba(0, 0, 0, 0.1)';

    els.workshopLayer.appendChild(
        poly
    );
}

function validateWorkshopPoints(
    points
) {

    if (
        !Array.isArray(points) ||
        points.length < 3
    ) {
        throw new Error(
            'Минимум 3 точки для создания полигона.'
        );
    }

    for (
        const point
        of points
    ) {

        if (
            !Array.isArray(point) ||
            point.length < 2 ||
            !Number.isFinite(
                Number(point[0])
            ) ||
            !Number.isFinite(
                Number(point[1])
            )
        ) {
            throw new Error(
                'Координаты цеха должны быть корректными числами.'
            );
        }
    }
}

function generateWorkshopCode(
    name
) {

    const translit =
        String(
            name ||
            'WORKSHOP'
        )
            .toUpperCase()
            .replace(
                /[^A-ZА-ЯЁ0-9]+/g,
                '_'
            )
            .replace(
                /[А-ЯЁ]/g,
                ch =>
                ({
                    'А': 'A',
                    'Б': 'B',
                    'В': 'V',
                    'Г': 'G',
                    'Д': 'D',
                    'Е': 'E',
                    'Ё': 'E',
                    'Ж': 'ZH',
                    'З': 'Z',
                    'И': 'I',
                    'Й': 'Y',
                    'К': 'K',
                    'Л': 'L',
                    'М': 'M',
                    'Н': 'N',
                    'О': 'O',
                    'П': 'P',
                    'Р': 'R',
                    'С': 'S',
                    'Т': 'T',
                    'У': 'U',
                    'Ф': 'F',
                    'Х': 'H',
                    'Ц': 'C',
                    'Ч': 'CH',
                    'Ш': 'SH',
                    'Щ': 'SCH',
                    'Ъ': '',
                    'Ы': 'Y',
                    'Ь': '',
                    'Э': 'E',
                    'Ю': 'YU',
                    'Я': 'YA'
                }[ch] || ch)
            )
            .replace(
                /[^A-Z0-9_]+/g,
                ''
            )
            .replace(
                /^_+|_+$/g,
                ''
            )
            .slice(
                0,
                45
            ) ||
        'WORKSHOP';

    const used =
        new Set(
            state.workshops.map(
                w =>
                    String(
                        w.code || ''
                    ).toUpperCase()
            )
        );

    if (
        !used.has(
            translit
        )
    ) {
        return translit;
    }

    for (
        let i = 2;
        i < 1000;
        i++
    ) {

        const suffix =
            `_${i}`;

        const candidate =
            translit.slice(
                0,
                50 -
                suffix.length
            ) +
            suffix;

        if (
            !used.has(
                candidate
            )
        ) {
            return candidate;
        }
    }

    return `WORKSHOP_${Date.now()}`;
}

async function saveWorkshop() {

    try {

        validateWorkshopPoints(
            state.currentPoints
        );

        const name =
            String(
                state.newWorkshopName ||
                ''
            ).trim();

        const font_size =
            Number(
                state.newWorkshopFontSize ||
                24
            );

        if (!name) {
            throw new Error(
                'Укажите название цеха.'
            );
        }

        if (
            !Number.isFinite(
                font_size
            ) ||
            font_size < 10
        ) {
            throw new Error(
                'Размер шрифта должен быть не меньше 10.'
            );
        }

        if (state.saving) return;

        const editingId =
            state.editingWorkshopId;

        const existing =
            editingId
                ? state.workshops.find(
                    w =>
                        Number(w.id) ===
                        Number(
                            editingId
                        )
                )
                : null;

        state.saving =
            true;

        const payload = {
            name,

            font_size,

            points:
                state.currentPoints.map(
                    p => [
                        Number(p[0]),
                        Number(p[1])
                    ]
                )
        };

        // Для существующего цеха
        // сохраняем остальные поля.
        if (editingId) {

            payload.id =
                editingId;

            payload.code =
                existing?.code ||
                generateWorkshopCode(
                    name
                );

            payload.label_x =
                existing?.label_x ??
                null;

            payload.label_y =
                existing?.label_y ??
                null;

            payload.description =
                existing?.description ??
                null;

            await apiRequest(
                '/workshops/update.php',
                {
                    method: 'POST',
                    body: payload
                }
            );

        } else {

            // code обязателен в БД.
            payload.code =
                generateWorkshopCode(
                    name
                );

            await apiRequest(
                '/workshops/create.php',
                {
                    method: 'POST',
                    body: payload
                }
            );
        }

        await loadWorkshops();

        await loadLegends();

        state.drawingWorkshop =
            false;

        state.movingLabel =
            false;

        state.editingWorkshopId =
            null;

        state.currentPoints =
            [];

        els.mapStage.classList.remove(
            'placing'
        );

        renderLayersMenu();

        showToast(
            editingId
                ? 'Цех обновлен!'
                : 'Цех создан!'
        );

    } catch (e) {

        showToast(
            e.message,
            true
        );

        drawCurrentPolygon();

    } finally {

        state.saving =
            false;
    }
}

async function saveMovedLabel(
    id,
    x,
    y
) {

    const w =
        state.workshops.find(
            item =>
                Number(item.id) ===
                Number(id)
        );

    if (!w) return;

    const oldX =
        w.label_x;

    const oldY =
        w.label_y;

    try {

        await apiRequest(
            '/workshops/update.php',
            {
                method: 'POST',

                body: {
                    id,

                    name:
                        w.name,

                    code:
                        w.code,

                    font_size:
                        Number(
                            w.font_size ||
                            24
                        ),

                    points:
                        w.points,

                    label_x:
                        Number(x),

                    label_y:
                        Number(y),

                    description:
                        w.description ??
                        null
                }
            }
        );

        w.label_x =
            Number(x);

        w.label_y =
            Number(y);

        await loadLegends();

        renderWorkshops();

    } catch (e) {

        w.label_x =
            oldX;

        w.label_y =
            oldY;

        renderWorkshops();

        showToast(
            e.message,
            true
        );

        throw e;
    }
}

async function loadWorkshops() {

    const workshops =
        await apiRequest(
            '/workshops/list.php'
        );

    state.workshops =
        workshops;

    renderWorkshops();
}

async function deleteWorkshop(
    id
) {

    const workshop =
        state.workshops.find(
            w =>
                Number(w.id) ===
                Number(id)
        );

    if (!workshop) return;

    // По схеме БД:
    // legends.workshop_id имеет
    // ON DELETE SET NULL.
    //
    // Поэтому удаление цеха
    // НЕ удаляет легенды.

    const attachedCount =
        state.legends.filter(
            l =>
                Number(
                    l.workshop_id
                ) ===
                Number(id)
        ).length;

    const message =
        attachedCount
            ? `Удалить цех «${workshop.name}»?\n\nЛегенды (${attachedCount} шт.), привязанные к нему, НЕ будут удалены — их привязка к цеху будет снята.`
            : `Удалить цех «${workshop.name}»?`;

    if (
        !confirm(message)
    ) {
        return;
    }

    try {

        await apiRequest(
            '/workshops/delete.php',
            {
                method: 'POST',
                body: {
                    id
                }
            }
        );

        state.editingWorkshopId =
            null;

        state.movingLabel =
            false;

        state.drawingWorkshop =
            false;

        state.currentPoints =
            [];

        await Promise.all([
            loadWorkshops(),
            loadLegends()
        ]);

        renderLayersMenu();

        showToast(
            'Цех удален. Привязка его легенд обновлена.'
        );

    } catch (e) {

        try {
            await Promise.all([
                loadWorkshops(),
                loadLegends()
            ]);

            renderLayersMenu();

        } catch (_) { }

        showToast(
            e.message,
            true
        );
    }
}

async function openWorkshopEditor(
    id
) {

    const w =
        state.workshops.find(
            x =>
                Number(x.id) ===
                Number(id)
        );

    if (!w) return;

    state.editingWorkshopId =
        Number(id);

    state.menuMode =
        'workshop_edit';

    els.menuContent.innerHTML = `
        <h3>
            Редактирование цеха
        </h3>

        <div class="form-grid">

            <div
                class="field field-wide"
            >
                <label>
                    Название:
                </label>

                <input
                    id="editWorkshopName"
                    type="text"
                    value="${attr(
        w.name
    )}"
                    maxlength="150"
                >
            </div>

            <div class="field">
                <label>
                    Код:
                </label>

                <input
                    id="editWorkshopCode"
                    type="text"
                    value="${attr(
        w.code || ''
    )}"
                    maxlength="50"
                >
            </div>

            <div class="field">
                <label>
                    Размер шрифта:
                </label>

                <input
                    id="editWorkshopFont"
                    type="number"
                    min="10"
                    max="200"
                    value="${Number(
        w.font_size ||
        24
    )}"
                >
            </div>

        </div>

        <div
            class="menu-toolbar actions"
        >

            <button
                class="btn btn-primary"
                id="saveEditWorkshopBtn"
            >
                Сохранить
            </button>

            <button
                class="btn"
                id="moveLabelBtn"
            >
                Переместить надпись
            </button>

            <button
                class="btn"
                id="redrawWorkshopBtn"
            >
                Перерисовать зону
            </button>

            <button
                class="btn btn-danger"
                id="deleteWorkshopBtn"
            >
                Удалить цех
            </button>

            <button
                class="btn"
                id="cancelEditWorkshopBtn"
            >
                Закрыть
            </button>

        </div>
    `;

    document
        .getElementById(
            'saveEditWorkshopBtn'
        )
        .onclick =
        async () => {

            if (state.saving) return;

            const name =
                document
                    .getElementById(
                        'editWorkshopName'
                    )
                    .value
                    .trim();

            const code =
                document
                    .getElementById(
                        'editWorkshopCode'
                    )
                    .value
                    .trim();

            const font_size =
                Number(
                    document
                        .getElementById(
                            'editWorkshopFont'
                        )
                        .value
                );

            try {

                if (!name) {
                    throw new Error(
                        'Укажите название цеха.'
                    );
                }

                if (!code) {
                    throw new Error(
                        'Укажите код цеха.'
                    );
                }

                if (
                    !Number.isFinite(
                        font_size
                    ) ||
                    font_size < 10
                ) {
                    throw new Error(
                        'Размер шрифта должен быть не меньше 10.'
                    );
                }

                state.saving =
                    true;

                await apiRequest(
                    '/workshops/update.php',
                    {
                        method: 'POST',

                        body: {
                            id:
                                Number(id),

                            name,

                            code,

                            font_size,

                            points:
                                w.points ||
                                [],

                            label_x:
                                w.label_x ??
                                null,

                            label_y:
                                w.label_y ??
                                null,

                            description:
                                w.description ??
                                null
                        }
                    }
                );

                await loadWorkshops();

                await loadLegends();

                renderLayersMenu();

                showToast(
                    'Цех обновлен'
                );

            } catch (e) {

                showToast(
                    e.message,
                    true
                );

            } finally {

                state.saving =
                    false;
            }
        };

    document
        .getElementById(
            'moveLabelBtn'
        )
        .onclick = () =>
            startMoveLabel(
                id
            );

    document
        .getElementById(
            'redrawWorkshopBtn'
        )
        .onclick = () => {

            state.newWorkshopName =
                w.name;

            state.newWorkshopFontSize =
                Number(
                    w.font_size ||
                    24
                );

            state.editingWorkshopId =
                Number(id);

            state.drawingWorkshop =
                true;

            state.movingLabel =
                false;

            state.currentPoints =
                [];

            els.menuContent.innerHTML = `
                <h3>
                    Перерисовка цеха
                </h3>

                <p class="hint">
                    Кликайте по карте,
                    чтобы задать новую границу.
                    Enter — сохранить,
                    Esc — отменить.
                </p>

                <div
                    class="menu-toolbar actions"
                >

                    <button
                        class="btn btn-primary"
                        id="saveRedrawWorkshopBtn"
                    >
                        Сохранить зону
                    </button>

                    <button
                        class="btn"
                        id="cancelRedrawWorkshopBtn"
                    >
                        Отмена
                    </button>

                </div>
            `;

            document
                .getElementById(
                    'saveRedrawWorkshopBtn'
                )
                .onclick =
                saveWorkshop;

            document
                .getElementById(
                    'cancelRedrawWorkshopBtn'
                )
                .onclick = () => {

                    cancelWorkshopDrawing();

                    state.editingWorkshopId =
                        null;

                    renderLayersMenu();
                };

            showToast(
                'Кликайте по карте для новой границы. Enter — сохранить.'
            );
        };

    document
        .getElementById(
            'deleteWorkshopBtn'
        )
        .onclick = () =>
            deleteWorkshop(
                id
            );

    document
        .getElementById(
            'cancelEditWorkshopBtn'
        )
        .onclick = () => {

            state.editingWorkshopId =
                null;

            state.movingLabel =
                false;

            state.drawingWorkshop =
                false;

            state.currentPoints =
                [];

            renderLayersMenu();
        };
}

// ============================================
// МАССОВОЕ РЕДАКТИРОВАНИЕ
// LASSO + CTRL+КЛИК
// ============================================

function renderMassEditMenu() {

    state.menuMode =
        'mass_edit';

    const selectedIds =
        Array.from(
            state.multiSelect
        )
            .map(Number)
            .filter(
                id =>
                    state.legends.some(
                        l =>
                            Number(l.id) ===
                            id
                    )
            );

    state.multiSelect =
        new Set(
            selectedIds
        );

    const selectedLegends =
        state.legends.filter(
            l =>
                state.multiSelect.has(
                    Number(l.id)
                )
        );

    if (
        selectedLegends.length ===
        0
    ) {

        state.selectedLegendId =
            null;

        return renderLayersMenu();
    }

    const first =
        selectedLegends[0];

    els.menuContent.innerHTML = `
        <h3>
            Массовое редактирование
        </h3>

        <p class="muted">
            Выбрано:
            ${selectedLegends.length}
            шт.
        </p>

        <div class="form-grid">

            <div class="field">

                <label>
                    Размер
                </label>

                <input
                    id="massLegendSize"
                    type="number"
                    min="20"
                    value="${Number(
        first.width ||
        64
    )}"
                >

            </div>

            <div class="field">

                <label>
                    Толщина обводки
                </label>

                <input
                    id="massLegendBorder"
                    type="number"
                    min="0"
                    step="0.5"
                    value="${Number(
        first.border_width ||
        3.2
    )}"
                >

            </div>

        </div>

        <div class="bases">

            <h4>
                Базы 1С
            </h4>

            <p class="hint">
                Эти базы и версии будут
                установлены у всех выбранных
                легенд. Пустой список удалит
                базы 1С у всех.
            </p>

            <div id="massBaseRows"></div>

            <button
                class="btn"
                id="massAddBaseBtn"
                type="button"
            >
                + Добавить базу
            </button>

        </div>

        <div
            class="menu-toolbar actions"
        >

            <button
                class="btn btn-primary"
                id="saveMassEditBtn"
            >
                Применить ко всем
            </button>

            <button
                class="btn btn-danger"
                id="deleteMassBtn"
            >
                Удалить выбранные
            </button>

            <button
                class="btn"
                id="cancelMassEditBtn"
            >
                Отмена
            </button>

        </div>
    `;

    const baseRows =
        document.getElementById(
            'massBaseRows'
        );

    (
        first.one_c_bases || []
    ).forEach(
        b =>
            addBaseRow(
                baseRows,
                b
            )
    );

    document
        .getElementById(
            'massAddBaseBtn'
        )
        .onclick = () =>
            addBaseRow(
                baseRows
            );

    document
        .getElementById(
            'saveMassEditBtn'
        )
        .onclick =
        async () => {

            if (state.saving) return;

            const before = {
                legendsArray:
                    JSON.parse(
                        JSON.stringify(
                            state.legends
                        )
                    )
            };

            try {

                const width =
                    Number(
                        document
                            .getElementById(
                                'massLegendSize'
                            )
                            .value
                    );

                const border_width =
                    Number(
                        document
                            .getElementById(
                                'massLegendBorder'
                            )
                            .value
                    );

                if (
                    !Number.isFinite(
                        width
                    ) ||
                    width < 20
                ) {
                    throw new Error(
                        'Размер легенды должен быть не меньше 20.'
                    );
                }

                if (
                    !Number.isFinite(
                        border_width
                    ) ||
                    border_width < 0
                ) {
                    throw new Error(
                        'Толщина обводки не может быть отрицательной.'
                    );
                }

                const one_c_bases =
                    Array.from(
                        document.querySelectorAll(
                            '#massBaseRows .base-row'
                        )
                    ).map(
                        r => ({
                            one_c_base_id:
                                Number(
                                    r.querySelector(
                                        '.base-id'
                                    ).value
                                ),

                            installed_version:
                                r.querySelector(
                                    '.base-version'
                                ).value.trim()
                        })
                    );

                const seenBases =
                    new Set();

                for (
                    const base
                    of one_c_bases
                ) {

                    if (
                        !base.one_c_base_id &&
                        !base.installed_version
                    ) {
                        continue;
                    }

                    if (
                        !base.one_c_base_id ||
                        !base.installed_version
                    ) {
                        throw new Error(
                            'Для каждой базы 1С нужно указать и базу, и версию.'
                        );
                    }

                    if (
                        seenBases.has(
                            base.one_c_base_id
                        )
                    ) {
                        throw new Error(
                            'Одна и та же база 1С не может быть добавлена дважды.'
                        );
                    }

                    seenBases.add(
                        base.one_c_base_id
                    );
                }

                const bases =
                    one_c_bases.filter(
                        b =>
                            b.one_c_base_id &&
                            b.installed_version
                    );

                state.saving =
                    true;

                // Фиксируем именно тот набор,
                // который был выбран в момент нажатия.
                const ids =
                    Array.from(
                        state.multiSelect
                    ).map(Number);

                for (
                    const id
                    of ids
                ) {

                    const l =
                        state.legends.find(
                            x =>
                                Number(
                                    x.id
                                ) ===
                                id
                        );

                    if (!l) continue;

                    await apiRequest(
                        '/legends/update.php',
                        {
                            method: 'POST',

                            body: {
                                id:
                                    l.id,

                                name:
                                    l.name,

                                legend_type_id:
                                    Number(
                                        l.legend_type_id
                                    ),

                                color_id:
                                    Number(
                                        l.color_id
                                    ),

                                x:
                                    Number(l.x),

                                y:
                                    Number(l.y),

                                width,

                                height:
                                    width,

                                border_width,

                                shape:
                                    l.shape ||
                                    'circle',

                                workshop_id:
                                    findWorkshopId(
                                        Number(l.x),
                                        Number(l.y)
                                    ),

                                // ВАЖНО:
                                // [] удаляет старые базы.
                                one_c_bases:
                                    bases
                            }
                        }
                    );
                }

                pushHistory(
                    before
                );

                await loadLegends();

                state.multiSelect.clear();

                state.selectedLegendId =
                    null;

                renderLayersMenu();

                showToast(
                    `Изменения применены к ${ids.length} легенд(ам).`
                );

            } catch (e) {

                try {
                    await loadLegends();
                } catch (_) { }

                renderMassEditMenu();

                showToast(
                    e.message,
                    true
                );

            } finally {

                state.saving =
                    false;
            }
        };

    document
        .getElementById(
            'deleteMassBtn'
        )
        .onclick =
        deleteSelectedLegends;

    document
        .getElementById(
            'cancelMassEditBtn'
        )
        .onclick = () => {

            state.multiSelect.clear();

            state.selectedLegendId =
                null;

            renderLegends();

            renderLayersMenu();
        };
}

async function deleteSelectedLegends() {

    const ids =
        Array.from(
            state.multiSelect
        ).map(Number);

    if (!ids.length) return;

    if (
        !confirm(
            `Вы действительно хотите удалить выбранные легенды? (${ids.length} шт.)`
        )
    ) {
        return;
    }

    const before = {
        legendsArray:
            JSON.parse(
                JSON.stringify(
                    state.legends
                )
            )
    };

    try {

        const errors = [];

        for (
            const id
            of ids
        ) {

            try {

                await apiRequest(
                    '/legends/delete.php',
                    {
                        method: 'POST',
                        body: {
                            id
                        }
                    }
                );

            } catch (e) {

                errors.push(
                    `${id}: ${e.message}`
                );
            }
        }

        await loadLegends();

        // Оставляем выделенными только те записи,
        // которые реально существуют.
        state.multiSelect =
            new Set(
                ids.filter(
                    id =>
                        state.legends.some(
                            l =>
                                Number(
                                    l.id
                                ) ===
                                id
                        )
                )
            );

        const deletedCount =
            ids.length -
            state.multiSelect.size;

        if (
            deletedCount > 0
        ) {
            pushHistory(
                before
            );
        }

        if (
            errors.length
        ) {

            renderMassEditMenu();

            showToast(
                `Удалено ${deletedCount} из ${ids.length}. ${errors.join('; ')}`,
                true
            );

        } else {

            state.multiSelect.clear();

            state.selectedLegendId =
                null;

            renderLayersMenu();

            showToast(
                'Выбранные легенды удалены.'
            );
        }

    } catch (e) {

        try {
            await loadLegends();
        } catch (_) { }

        renderLayersMenu();

        showToast(
            e.message,
            true
        );
    }
}

// ============================================
// LASSO ВЫДЕЛЕНИЕ
// ============================================

function handleLassoStart(e) {

    if (
        !state.editMode ||
        e.button !== 0
    ) {
        return;
    }

    if (
        e.target.closest(
            '.legend'
        )
    ) {
        return;
    }

    state.isLassoing =
        true;

    state.lassoMoved =
        false;

    const p =
        screenToMap(
            e.clientX,
            e.clientY
        );

    state.lassoStart =
        p;

    state.lassoRect =
        document.createElementNS(
            NS,
            'rect'
        );

    state.lassoRect.classList.add(
        'lasso-rect'
    );

    state.lassoRect.setAttribute(
        'x',
        p.x
    );

    state.lassoRect.setAttribute(
        'y',
        p.y
    );

    state.lassoRect.setAttribute(
        'width',
        0
    );

    state.lassoRect.setAttribute(
        'height',
        0
    );

    els.mapSvg.appendChild(
        state.lassoRect
    );

    e.preventDefault();
}

function handleLassoMove(e) {

    if (
        !state.isLassoing ||
        !state.lassoRect
    ) {
        return;
    }

    const p =
        screenToMap(
            e.clientX,
            e.clientY
        );

    const x =
        Math.min(
            state.lassoStart.x,
            p.x
        );

    const y =
        Math.min(
            state.lassoStart.y,
            p.y
        );

    const w =
        Math.abs(
            p.x -
            state.lassoStart.x
        );

    const h =
        Math.abs(
            p.y -
            state.lassoStart.y
        );

    if (
        w > 3 ||
        h > 3
    ) {
        state.lassoMoved =
            true;
    }

    state.lassoRect.setAttribute(
        'x',
        x
    );

    state.lassoRect.setAttribute(
        'y',
        y
    );

    state.lassoRect.setAttribute(
        'width',
        w
    );

    state.lassoRect.setAttribute(
        'height',
        h
    );
}

function handleLassoEnd(e) {

    if (
        !state.isLassoing
    ) {
        return;
    }

    state.isLassoing =
        false;

    if (
        state.lassoRect
    ) {

        state.lassoRect.remove();

        state.lassoRect =
            null;
    }

    const p =
        screenToMap(
            e.clientX,
            e.clientY
        );

    // Одиночный клик по пустому месту —
    // просто снимаем выделение, но меню НЕ сбрасываем!
    if (
        !state.lassoMoved
    ) {

        state.multiSelect.clear();

        state.selectedLegendId =
            null;

        renderLegends();

        // [ПРАВКА] Убрали renderLayersMenu() из этого блока
        return;
    }

    const x1 =
        Math.min(
            state.lassoStart.x,
            p.x
        );

    const y1 =
        Math.min(
            state.lassoStart.y,
            p.y
        );

    const x2 =
        Math.max(
            state.lassoStart.x,
            p.x
        );

    const y2 =
        Math.max(
            state.lassoStart.y,
            p.y
        );

    state.multiSelect.clear();

    state.legends.forEach(
        l => {

            if (
                !state.visibleTypes.has(
                    Number(
                        l.legend_type_id
                    )
                )
            ) {
                return;
            }

            const lx =
                Number(l.x);

            const ly =
                Number(l.y);

            if (
                lx >= x1 &&
                lx <= x2 &&
                ly >= y1 &&
                ly <= y2
            ) {

                state.multiSelect.add(
                    Number(l.id)
                );
            }
        }
    );

    if (
        state.multiSelect.size >
        1
    ) {

        state.selectedLegendId =
            Array.from(
                state.multiSelect
            )[0];

        renderLegends();

        renderMassEditMenu();

    } else if (
        state.multiSelect.size ===
        1
    ) {

        const id =
            Array.from(
                state.multiSelect
            )[0];

        state.selectedLegendId =
            id;

        renderLegends();

        openLegendCard(
            id
        );

    } else {

        state.selectedLegendId =
            null;

        renderLegends();
        // [ПРАВКА] Убрали renderLayersMenu() из этого блока
    }

    e.stopPropagation();
}

// ============================================
// КООРДИНАТНАЯ СЕТКА
// ============================================

function initCoordinateOverlay() {

    if (
        !els.coordsDisplay ||
        !els.coordsCrossX ||
        !els.coordsCrossY
    ) {
        return;
    }

    els.mapSvg.addEventListener(
        'mousemove',
        updateCoordsOverlay
    );

    els.mapSvg.addEventListener(
        'mouseleave',
        hideCoordsOverlay
    );

    if (
        els.coordsBtn
    ) {

        els.coordsBtn.onclick =
            () => {

                state.isShowingCoords =
                    !state.isShowingCoords;

                els.coordsBtn.classList.toggle(
                    'active',
                    state.isShowingCoords
                );

                hideCoordsOverlay();
            };
    }
}

function updateCoordsOverlay(e) {

    if (
        !state.isShowingCoords
    ) {
        return;
    }

    const p =
        screenToMap(
            e.clientX,
            e.clientY
        );

    const rect =
        els.mapStage.getBoundingClientRect();

    const localX =
        e.clientX -
        rect.left;

    const localY =
        e.clientY -
        rect.top;

    els.coordsDisplay.style.opacity =
        '1';

    els.coordsCrossX.style.opacity =
        '1';

    els.coordsCrossY.style.opacity =
        '1';

    els.coordsCrossX.setAttribute(
        'y1',
        p.y
    );

    els.coordsCrossX.setAttribute(
        'y2',
        p.y
    );

    els.coordsCrossY.setAttribute(
        'x1',
        p.x
    );

    els.coordsCrossY.setAttribute(
        'x2',
        p.x
    );

    els.coordsDisplay.textContent =
        `X: ${p.x.toFixed(1)} | Y: ${p.y.toFixed(1)}`;

    els.coordsDisplay.style.left =
        `${Math.min(
            localX + 15,
            rect.width - 150
        )}px`;

    els.coordsDisplay.style.top =
        `${Math.min(
            localY - 30,
            rect.height - 30
        )}px`;
}

function hideCoordsOverlay() {

    if (
        !els.coordsDisplay ||
        !els.coordsCrossX ||
        !els.coordsCrossY
    ) {
        return;
    }

    els.coordsDisplay.style.opacity =
        '0';

    els.coordsCrossX.style.opacity =
        '0';

    els.coordsCrossY.style.opacity =
        '0';
}

// ============================================
// УТИЛИТЫ
// ============================================

function esc(v) {

    return String(
        v ?? ''
    ).replace(
        /[&<>"']/g,
        c =>
        ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[c])
    );
}

function attr(v) {
    return esc(v);
}

function clamp(
    v,
    a,
    b
) {
    return Math.max(
        a,
        Math.min(
            b,
            v
        )
    );
}

function showToast(
    m,
    error = false
) {

    els.toast.textContent =
        m;

    els.toast.classList.toggle(
        'error',
        error
    );

    els.toast.classList.remove(
        'hidden'
    );

    clearTimeout(
        showToast.timer
    );

    showToast.timer =
        setTimeout(
            () =>
                els.toast.classList.add(
                    'hidden'
                ),
            3500
        );
}

function toggleEditMode() {

    state.editMode =
        !state.editMode;

    renderLegends();

    if (
        state.editMode &&
        state.multiSelect.size > 1
    ) {
        renderMassEditMenu();
    }

    if (
        state.editMode
    ) {

        els.lockIcon.style.display =
            'none';

        els.unlockIcon.style.display =
            'block';

        els.editModeBtn.classList.add(
            'active'
        );

        showToast(
            'Режим редактирования включен'
        );

    } else {

        els.lockIcon.style.display =
            'block';

        els.unlockIcon.style.display =
            'none';

        els.editModeBtn.classList.remove(
            'active'
        );

        showToast(
            'Режим просмотра'
        );
    }
}

els.editModeBtn.onclick =
    toggleEditMode;

// ============================================
// КНОПКИ ЗУМА
// ============================================

function zoomAtStageCenter(
    factor
) {

    const rect =
        els.mapStage.getBoundingClientRect();

    zoomAtPoint(
        factor,
        rect.left +
        rect.width / 2,
        rect.top +
        rect.height / 2
    );
}

els.zoomInBtn.onclick =
    () =>
        zoomAtStageCenter(
            1.2
        );

els.zoomOutBtn.onclick =
    () =>
        zoomAtStageCenter(
            0.8
        );

els.zoomResetBtn.onclick =
    () => {

        state.viewBox.x =
            0;

        state.viewBox.y =
            0;

        state.viewBox.w =
            2048;

        state.viewBox.h =
            1290;

        applyViewBox();
    };

els.zoomLevelInput.onchange =
    () => {

        const val =
            clamp(
                parseFloat(
                    els.zoomLevelInput.value
                ) || 1,
                0.1,
                5
            );

        const scale =
            1 / val;

        const newW =
            2048 *
            scale;

        const newH =
            1290 *
            scale;

        state.viewBox.w =
            newW;

        state.viewBox.h =
            newH;

        state.viewBox.x =
            Math.max(
                0,
                (2048 -
                    newW) / 2
            );

        state.viewBox.y =
            Math.max(
                0,
                (1290 -
                    newH) / 2
            );

        els.zoomLevelInput.value =
            val.toFixed(2);

        applyViewBox();
    };

// ============================================
// ЭКСПОРТ
// PNG / CSV / EXCEL
// ============================================

function initExportButtons() {

    const exportContainer =
        document.createElement(
            'div'
        );

    exportContainer.className =
        'export-toolbar';

    exportContainer.innerHTML = `
        <h4>
            Экспорт
        </h4>

        <button
            class="btn"
            id="exportPngBtn"
        >
            PNG
        </button>

        <button
            class="btn"
            id="exportCsvBtn"
        >
            Excel (CSV)
        </button>

        <button
            class="btn"
            id="exportCustomExcelBtn"
        >
            Excel (настраиваемый)
        </button>
    `;

    els.leftMenu.appendChild(
        exportContainer
    );

    document
        .getElementById(
            'exportPngBtn'
        )
        .onclick =
        exportToPng;

    document
        .getElementById(
            'exportCsvBtn'
        )
        .onclick =
        exportToCsv;

    document
        .getElementById(
            'exportCustomExcelBtn'
        )
        .onclick = () => {

            if (
                typeof XLSX ===
                'undefined'
            ) {

                showToast(
                    'Не загружена библиотека Excel. Проверьте подключение xlsx-js-style.',
                    true
                );

                return;
            }

            openCustomExportModal();
        };
}

function loadImage(
    url
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const img =
                new Image();

            img.onload =
                () =>
                    resolve(
                        img
                    );

            img.onerror =
                () =>
                    reject(
                        new Error(
                            `Не удалось загрузить изображение: ${url}`
                        )
                    );

            img.src =
                url;
        }
    );
}

function serializeVectorSvg() {

    const svg =
        els.mapSvg;

    const clone =
        svg.cloneNode(
            true
        );

    clone.setAttribute(
        'xmlns',
        'http://www.w3.org/2000/svg'
    );

    clone.setAttribute(
        'width',
        MAP_CONFIG.width
    );

    clone.setAttribute(
        'height',
        MAP_CONFIG.height
    );

    const dynamicElements =
        clone.querySelectorAll(
            '#coordsCrossX, #coordsCrossY, .lasso-rect, #baseMapImage'
        );

    dynamicElements.forEach(
        el =>
            el.remove()
    );

    const style =
        document.createElementNS(
            NS,
            'style'
        );

    style.textContent = `
        .workshop-label {
            fill: #000;
            font-family: Arial, sans-serif;
            font-weight: bold;
            stroke: #fff;
            stroke-width: 3px;
            paint-order: stroke;
        }

        .legend-body {
            stroke: #00204a;
            stroke-width: 2;
        }

        .legend-code {
            font-size: 16px;
            font-weight: bold;
            text-anchor: middle;
            fill: #00204a;
        }

        .legend-name {
            font-size: 12px;
            fill: #333;
        }
    `;

    clone.appendChild(
        style
    );

    return new XMLSerializer()
        .serializeToString(
            clone
        );
}

async function renderToCanvas() {

    const bgUrl =
        'assets/map-base.png';

    const bgImage =
        await loadImage(
            bgUrl
        );

    const svgString =
        serializeVectorSvg();

    const svgImage =
        await loadImage(
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(
                svgString
            )
        );

    const canvas =
        document.createElement(
            'canvas'
        );

    canvas.width =
        MAP_CONFIG.width;

    canvas.height =
        MAP_CONFIG.height;

    const ctx =
        canvas.getContext(
            '2d'
        );

    ctx.drawImage(
        bgImage,
        0,
        0,
        MAP_CONFIG.width,
        MAP_CONFIG.height
    );

    ctx.drawImage(
        svgImage,
        0,
        0,
        MAP_CONFIG.width,
        MAP_CONFIG.height
    );

    return canvas;
}

function downloadBlob(
    content,
    fileName,
    mimeType
) {

    const blob =
        new Blob(
            [
                content
            ],
            {
                type:
                    mimeType
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const a =
        document.createElement(
            'a'
        );

    a.href =
        url;

    a.download =
        fileName;

    document.body.appendChild(
        a
    );

    a.click();

    document.body.removeChild(
        a
    );

    URL.revokeObjectURL(
        url
    );
}

async function exportToPng() {

    showToast(
        'Формируем PNG...'
    );

    try {

        const canvas =
            await renderToCanvas();

        canvas.toBlob(
            blob => {

                if (!blob) {
                    showToast(
                        'Не удалось сформировать PNG.',
                        true
                    );
                    return;
                }

                const downloadUrl =
                    URL.createObjectURL(
                        blob
                    );

                const a =
                    document.createElement(
                        'a'
                    );

                a.href =
                    downloadUrl;

                a.download =
                    'industrial-map.png';

                document.body.appendChild(
                    a
                );

                a.click();

                document.body.removeChild(
                    a
                );

                URL.revokeObjectURL(
                    downloadUrl
                );

                showToast(
                    'PNG сохранен'
                );

            },
            'image/png'
        );

    } catch (e) {

        showToast(
            e.message,
            true
        );
    }
}

function exportToCsv() {

    let csv =
        '\uFEFFID;Имя;Тип;Цвет;X;Y;Ширина;Высота;Цех\n';

    state.legends.forEach(
        l => {

            csv +=
                `${l.id};"${String(
                    l.name || ''
                ).replace(
                    /"/g,
                    '""'
                )}";"${String(
                    l.type_name || ''
                ).replace(
                    /"/g,
                    '""'
                )}";"${String(
                    l.color_hex || ''
                ).replace(
                    /"/g,
                    '""'
                )}";${l.x};${l.y};${l.width};${l.height};"${String(
                    l.workshop_name || ''
                ).replace(
                    /"/g,
                    '""'
                )}"\n`;
        }
    );

    downloadBlob(
        csv,
        'legend-data.csv',
        'text/csv;charset=utf-8'
    );

    showToast(
        'CSV сохранен'
    );
}

// ============================================
// НАСТРАИВАЕМЫЙ ЭКСПОРТ В EXCEL
// ============================================

function openCustomExportModal() {

    const modal =
        document.createElement(
            'div'
        );

    modal.id =
        'customExportModal';

    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;

    const typeCheckboxes =
        state.legendTypes
            .map(
                t =>
                    `
                    <label
                        style="
                            display:block;
                            margin:5px 0;
                        "
                    >
                        <input
                            type="checkbox"
                            class="export-type-checkbox"
                            value="${t.id}"
                            checked
                        >

                        ${esc(
                        t.name
                    )}
                        (${esc(
                        t.code
                    )})
                    </label>
                    `
            )
            .join('');

    modal.innerHTML = `
        <div
            style="
                background:white;
                padding:20px;
                border-radius:8px;
                width:500px;
                max-height:80vh;
                overflow-y:auto;
            "
        >

            <h3>
                Настройки экспорта в Excel
            </h3>

            <h4>
                Выберите столбцы:
            </h4>

            <div
                style="
                    margin-bottom:15px;
                "
            >

                <label
                    style="display:block;"
                >
                    <input
                        type="checkbox"
                        class="export-column"
                        data-col="type"
                        checked
                    >
                    Вид легенды (AP, WS...)
                </label>

                <label
                    style="display:block;"
                >
                    <input
                        type="checkbox"
                        class="export-column"
                        data-col="name"
                        checked
                    >
                    Имя (модель)
                </label>

                <label
                    style="display:block;"
                >
                    <input
                        type="checkbox"
                        class="export-column"
                        data-col="workshop"
                        checked
                    >
                    Цех
                </label>

                <label
                    style="display:block;"
                >
                    <input
                        type="checkbox"
                        class="export-column"
                        data-col="bases"
                        checked
                    >
                    Базы 1С
                </label>

                <label
                    style="display:block;"
                >
                    <input
                        type="checkbox"
                        class="export-column"
                        data-col="versions"
                        checked
                    >
                    Версии 1С
                </label>

            </div>

            <h4>
                Выберите виды легенд:
            </h4>

            <div
                style="
                    margin-bottom:15px;
                "
            >
                ${typeCheckboxes}
            </div>

            <div
                style="
                    text-align:right;
                "
            >

                <button
                    class="btn"
                    id="cancelExportBtn"
                >
                    Отмена
                </button>

                <button
                    class="btn btn-primary"
                    id="confirmExportBtn"
                >
                    Экспортировать
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(
        modal
    );

    document
        .getElementById(
            'cancelExportBtn'
        )
        .onclick =
        () =>
            modal.remove();

    document
        .getElementById(
            'confirmExportBtn'
        )
        .onclick = () => {

            const selectedColumns =
                Array.from(
                    document.querySelectorAll(
                        '.export-column:checked'
                    )
                ).map(
                    cb =>
                        cb.dataset.col
                );

            const selectedTypes =
                Array.from(
                    document.querySelectorAll(
                        '.export-type-checkbox:checked'
                    )
                ).map(
                    cb =>
                        Number(
                            cb.value
                        )
                );

            modal.remove();

            exportCustomExcel(
                selectedColumns,
                selectedTypes
            );
        };
}

async function exportCustomExcel(
    selectedColumns,
    selectedTypes
) {

    showToast(
        'Формируем Excel...'
    );

    try {

        // ========================================
        // ТОЧНО ВАШИ ОТТЕНКИ
        // ARGB = FF + RGB
        // ========================================

        const typeColorMap = {

            'WS':
                'FF8DE2E2',

            'IPC':
                'FF96F096',

            'TP':
                'FFFFF97C',

            'MF':
                'FFFFBF7C',

            'AP':
                'FFFF7C7C',

            'S':
                'FF8B82E9',

            'PR':
                'FFFFA27C',

            'W':
                'FFB679E7',

            'DEFAULT':
                'FFFFFFFF'
        };

        // ========================================
        // БАЗЫ 1С
        // ТОЧНО ВАШ ЦВЕТ
        // ========================================

        const baseColor =
            'FFFFF751';

        const selectedColumnSet =
            new Set(
                selectedColumns
            );

        const needBases =
            selectedColumnSet.has(
                'bases'
            ) ||
            selectedColumnSet.has(
                'versions'
            );

        // ========================================
        // ЗАГОЛОВКИ
        // ========================================

        const headers = [];

        if (
            selectedColumnSet.has(
                'type'
            )
        ) {
            headers.push(
                'Вид'
            );
        }

        if (
            selectedColumnSet.has(
                'name'
            )
        ) {
            headers.push(
                'Имя'
            );
        }

        if (
            selectedColumnSet.has(
                'workshop'
            )
        ) {
            headers.push(
                'Цех'
            );
        }

        if (
            selectedColumnSet.has(
                'bases'
            )
        ) {
            headers.push(
                'Базы 1С'
            );
        }

        if (
            selectedColumnSet.has(
                'versions'
            )
        ) {
            headers.push(
                'Версии 1С'
            );
        }

        if (!headers.length) {

            showToast(
                'Выберите хотя бы один столбец.',
                true
            );

            return;
        }

        // ========================================
        // ФИЛЬТРАЦИЯ ВИДОВ
        // ========================================

        const filteredLegends =
            state.legends.filter(
                l =>
                    selectedTypes.includes(
                        Number(
                            l.legend_type_id
                        )
                    )
            );

        if (
            !filteredLegends.length
        ) {

            showToast(
                'Нет легенд выбранных видов для экспорта.',
                true
            );

            return;
        }

        const exportData = [];

        // ========================================
        // СБОР ДАННЫХ
        // ========================================

        for (
            const l
            of filteredLegends
        ) {

            let oneCBases =
                [];

            if (needBases) {

                try {

                    const detail =
                        await apiRequest(
                            '/legends/get.php',
                            {
                                query: {
                                    id: l.id
                                }
                            }
                        );

                    oneCBases =
                        Array.isArray(
                            detail.one_c_bases
                        )
                            ? detail.one_c_bases
                            : [];

                } catch (e) {

                    console.warn(
                        'Не удалось получить базы для легенды',
                        l.id,
                        e
                    );
                }
            }

            const typeCode =
                String(
                    l.type_code ||
                    state.legendTypes.find(
                        t =>
                            Number(
                                t.id
                            ) ===
                            Number(
                                l.legend_type_id
                            )
                    )?.code ||
                    ''
                ).toUpperCase();

            const typeColor =
                typeColorMap[
                typeCode
                ] ||
                typeColorMap.DEFAULT;

            const addRow =
                base => {

                    const row = {

                        type:
                            l.type_code ||
                            typeCode ||
                            '',

                        name:
                            l.name ||
                            '',

                        workshop:
                            l.workshop_name ||
                            '',

                        bases:
                            base?.name ||
                            '',

                        versions:
                            base?.installed_version ||
                            '',

                        equipmentColor:
                            typeColor,

                        baseColor:
                            baseColor
                    };

                    exportData.push(
                        row
                    );
                };

            if (
                needBases &&
                oneCBases.length
            ) {

                oneCBases.forEach(
                    addRow
                );

            } else {

                addRow(
                    null
                );
            }
        }

        // ========================================
        // МАССИВ СТРОК
        // ========================================

        const rows =
            exportData.map(
                item =>
                    headers.map(
                        header => {

                            switch (
                            header
                            ) {

                                case 'Вид':
                                    return item.type;

                                case 'Имя':
                                    return item.name;

                                case 'Цех':
                                    return item.workshop;

                                case 'Базы 1С':
                                    return item.bases;

                                case 'Версии 1С':
                                    return item.versions;

                                default:
                                    return '';
                            }
                        }
                    )
            );

        // ========================================
        // СОЗДАЁМ ЛИСТ
        // ========================================

        const worksheet =
            XLSX.utils.aoa_to_sheet(
                [
                    headers,
                    ...rows
                ]
            );

        // ========================================
        // ГРАНИЦЫ
        // ========================================

        const blackBorder = {

            top: {
                style: 'thin',
                color: {
                    rgb:
                        'FF000000'
                }
            },

            left: {
                style: 'thin',
                color: {
                    rgb:
                        'FF000000'
                }
            },

            bottom: {
                style: 'thin',
                color: {
                    rgb:
                        'FF000000'
                }
            },

            right: {
                style: 'thin',
                color: {
                    rgb:
                        'FF000000'
                }
            }
        };

        // ========================================
        // СТИЛЬ ЗАГОЛОВКА
        // ЖИРНЫЙ + 16
        // ========================================

        const headerStyle = {

            font: {
                bold:
                    true,

                sz:
                    16
            },

            alignment: {

                horizontal:
                    'center',

                vertical:
                    'center',

                wrapText:
                    true
            },

            fill: {
                fgColor: {
                    rgb:
                        'FFE0E0E0'
                }
            },

            border:
                blackBorder
        };

        // ========================================
        // СТИЛЬ ДАННЫХ
        // 14 pt + границы
        // ========================================

        const dataBaseStyle = {

            font: {
                sz:
                    14
            },

            alignment: {

                horizontal:
                    'left',

                vertical:
                    'center',

                wrapText:
                    true
            },

            border:
                blackBorder
        };

        // ========================================
        // СТИЛИ ЗАГОЛОВКОВ
        // ========================================

        headers.forEach(
            (
                header,
                colIndex
            ) => {

                const ref =
                    XLSX.utils.encode_cell(
                        {
                            r: 0,
                            c: colIndex
                        }
                    );

                if (
                    worksheet[ref]
                ) {

                    worksheet[ref].s =
                        headerStyle;
                }
            }
        );

        // ========================================
        // СТИЛИ ДАННЫХ
        //
        // ОБОРУДОВАНИЕ:
        // цвет зависит от вида
        //
        // 1С:
        // всегда FFFFF751
        // ========================================

        for (
            let rowIndex = 0;
            rowIndex <
            exportData.length;
            rowIndex++
        ) {

            const item =
                exportData[
                rowIndex
                ];

            headers.forEach(
                (
                    header,
                    colIndex
                ) => {

                    const ref =
                        XLSX.utils.encode_cell(
                            {
                                r:
                                    rowIndex + 1,

                                c:
                                    colIndex
                            }
                        );

                    const cell =
                        worksheet[
                        ref
                        ];

                    if (!cell) return;

                    const isBaseColumn =
                        header ===
                        'Базы 1С' ||
                        header ===
                        'Версии 1С';

                    cell.s = {

                        ...dataBaseStyle,

                        fill: {

                            fgColor: {

                                rgb:
                                    isBaseColumn
                                        ? item.baseColor
                                        : item.equipmentColor
                            }
                        }
                    };
                }
            );
        }

        // ========================================
        // ВЫСОТА СТРОК
        // ========================================

        worksheet['!rows'] = [

            {
                hpt:
                    24
            },

            ...exportData.map(
                () => ({
                    hpt:
                        21
                })
            )
        ];

        // ========================================
        // ШИРИНА СТОЛБЦОВ
        // ========================================

        worksheet['!cols'] =
            headers.map(
                (
                    header,
                    index
                ) => {

                    const maxLen =
                        Math.max(
                            header.length,

                            ...rows.map(
                                row =>
                                    String(
                                        row[index] ??
                                        ''
                                    ).length
                            )
                        );

                    const minWidth =
                        header ===
                            'Базы 1С' ||
                            header ===
                            'Версии 1С'
                            ? 18
                            : 12;

                    return {

                        wch:
                            Math.min(
                                Math.max(
                                    maxLen +
                                    2,
                                    minWidth
                                ),
                                42
                            )
                    };
                }
            );

        // ========================================
        // АВТОФИЛЬТР
        // ========================================

        worksheet['!autofilter'] = {

            ref:
                `A1:${XLSX.utils.encode_cell(
                    {
                        r:
                            exportData.length,

                        c:
                            headers.length -
                            1
                    }
                )}`
        };

        // ========================================
        // СОЗДАЁМ КНИГУ
        // ========================================

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            'Легенды'
        );

        XLSX.writeFile(
            workbook,
            'industrial-map-export.xlsx',
            {
                compression:
                    true,

                cellStyles:
                    true
            }
        );

        showToast(
            'Excel сохранен!'
        );

    } catch (e) {

        console.error(
            e
        );

        showToast(
            'Ошибка экспорта: ' +
            (
                e.message ||
                e
            ),
            true
        );
    }
}

// ============================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================

els.mapStage.addEventListener(
    'wheel',
    handleWheel,
    {
        passive: false
    }
);

els.mapStage.addEventListener(
    'mousedown',
    handlePanStart
);

window.addEventListener(
    'mousemove',
    handlePanMove
);

window.addEventListener(
    'mouseup',
    handlePanEnd
);

els.mapStage.addEventListener(
    'contextmenu',
    e =>
        e.preventDefault()
);

// ============================================
// КЛИК ПО КАРТЕ
// ============================================

els.mapSvg.addEventListener(
    'click',
    async e => {

        // ========================================
        // УСТАНОВКА НОВОЙ ЛЕГЕНДЫ
        // ========================================

        if (
            state.placingLegend
        ) {

            const inputX =
                document.getElementById(
                    'legendX'
                );

            const inputY =
                document.getElementById(
                    'legendY'
                );

            if (
                !inputX ||
                !inputY
            ) {

                state.placingLegend =
                    false;

                els.mapStage.classList.remove(
                    'placing'
                );

                return;
            }

            const p =
                screenToMap(
                    e.clientX,
                    e.clientY
                );

            inputX.value =
                clamp(
                    p.x,
                    0,
                    MAP_CONFIG.width
                ).toFixed(1);

            inputY.value =
                clamp(
                    p.y,
                    0,
                    MAP_CONFIG.height
                ).toFixed(1);

            els.mapStage.classList.remove(
                'placing'
            );

            state.placingLegend =
                false;

            showToast(
                `Координаты: ${p.x.toFixed(
                    1
                )}, ${p.y.toFixed(
                    1
                )}. Цех: ${getWorkshopName(
                    findWorkshopId(
                        p.x,
                        p.y
                    )
                )}`
            );

            return;
        }

        // ========================================
        // РИСОВАНИЕ / ПЕРЕМЕЩЕНИЕ ЦЕХА
        // ========================================

        if (
            state.drawingWorkshop ||
            state.movingLabel
        ) {

            await handleMapClickForWorkshop(
                e
            );

            return;
        }

        // ========================================
        // КЛИК ПО ПУСТОЙ КАРТЕ
        // ========================================
        // [ПРАВКА 3] Весь блок кода, который возвращал меню в состояние "Слои"
        // удалён. Теперь сброс меню возможен ТОЛЬКО при клике на кнопку "Слои".
        // Конфликты с функциями "Поставить на карту" и созданием цехов устранены.
    }
);

// ============================================
// LASSO
// ============================================

els.mapSvg.addEventListener(
    'pointerdown',
    handleLassoStart
);

window.addEventListener(
    'pointermove',
    handleLassoMove
);

window.addEventListener(
    'pointerup',
    handleLassoEnd
);

// ============================================
// КНОПКИ МЕНЮ
// ============================================

els.layersBtn.onclick =
    renderLayersMenu;

els.addLegendBtn.onclick =
    () => {

        const t =
            state.legendTypes[0];

        const c =
            state.colors.find(
                x =>
                    Number(x.id) ===
                    Number(
                        t?.default_color_id
                    )
            ) ||
            state.colors[0];

        renderLegendEditor(
            {
                name:
                    '',

                legend_type_id:
                    t?.id,

                color_id:
                    c?.id,

                x:
                    MAP_CONFIG.width /
                    2,

                y:
                    MAP_CONFIG.height /
                    2,

                width:
                    64,

                height:
                    64,

                border_width:
                    3.2,

                one_c_bases:
                    []
            },
            true
        );
    };

els.logoutBtn.onclick =
    async () => {

        try {

            await apiRequest(
                '/auth/logout.php',
                {
                    method:
                        'POST'
                }
            );

        } catch (_) { }

        localStorage.removeItem(
            'token'
        );

        localStorage.removeItem(
            'mkk_token'
        );

        location.href =
            'login.html';
    };

// ============================================
// ПОИСК
// ============================================

els.clearSearchBtn.onclick =
    async () => {

        els.searchInput.value =
            '';

        clearTimeout(
            state.searchTimer
        );

        const requestId =
            ++state.searchRequestId;

        try {

            await loadLegends(
                ''
            );

            if (
                requestId ===
                state.searchRequestId
            ) {

                applySearchHighlight();
            }

        } catch (e) {

            showToast(
                e.message,
                true
            );
        }
    };

els.searchInput.oninput =
    () => {

        clearTimeout(
            state.searchTimer
        );

        state.searchTimer =
            setTimeout(
                async () => {

                    const requestId =
                        ++state.searchRequestId;

                    const query =
                        els.searchInput.value.trim();

                    try {

                        await loadLegends(
                            query
                        );

                        if (
                            requestId ===
                            state.searchRequestId
                        ) {

                            applySearchHighlight();
                        }

                        if (
                            query &&
                            !state.legends.length
                        ) {

                            showToast(
                                'Не найдено',
                                true
                            );
                        }

                    } catch (e) {

                        showToast(
                            e.message,
                            true
                        );
                    }

                },
                250
            );
    };

els.searchInput.addEventListener(
    'keydown',
    async e => {

        if (
            e.key !==
            'Enter'
        ) {
            return;
        }

        e.preventDefault();

        clearTimeout(
            state.searchTimer
        );

        const requestId =
            ++state.searchRequestId;

        const query =
            els.searchInput.value.trim();

        try {

            await loadLegends(
                query
            );

            if (
                requestId ===
                state.searchRequestId
            ) {

                applySearchHighlight();
            }

        } catch (err) {

            showToast(
                err.message,
                true
            );
        }
    }
);

// ============================================
// ГОРЯЧИЕ КЛАВИШИ
// ============================================

document.addEventListener(
    'keydown',
    async e => {

        // ESC
        if (
            e.key === 'Escape' &&
            (
                state.drawingWorkshop ||
                state.movingLabel ||
                state.placingLegend ||
                state.isLassoing
            )
        ) {

            cancelWorkshopDrawing();

            state.placingLegend =
                false;

            state.isLassoing =
                false;

            if (
                state.lassoRect
            ) {

                state.lassoRect.remove();

                state.lassoRect =
                    null;
            }

            els.mapStage.classList.remove(
                'placing'
            );

            state.editingWorkshopId =
                null;

            renderLayersMenu();

            showToast(
                'Действие отменено'
            );
        }

        // ENTER — сохранить цех.
        if (
            e.key === 'Enter' &&
            state.drawingWorkshop
        ) {

            // Не срабатываем, если Enter
            // находится внутри обычного input.
            if (
                e.target.tagName ===
                'INPUT' ||
                e.target.tagName ===
                'TEXTAREA' ||
                e.target.tagName ===
                'SELECT'
            ) {
                return;
            }

            e.preventDefault();

            await saveWorkshop();
        }
    }
);

// ============================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ============================================

init();
