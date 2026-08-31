async function apiRequest(path, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        auth = true,
        query = undefined
    } = options;

    // Формируем корректный URL
    let base = window.APP_CONFIG.API_BASE_URL || '';
    base = base.replace(/\/$/, ''); // Убираем слэш на конце, если есть
    let url = `${base}/${path.replace(/^\//, '')}`;

    if (query) {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.set(key, value);
            }
        });
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
    }

    const headers = {
        'Accept': 'application/json'
    };

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    if (auth) {
        const token = localStorage.getItem('token');
        if (!token) {
            // Если нет токена, перенаправляем на логин
            if (window.location.pathname !== '/login.html') {
                location.href = 'login.html';
            }
            throw new Error('Требуется авторизация.');
        }
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    let result;
    try {
        result = await response.json();
    } catch (jsonError) {
        throw new Error(`API вернул некорректный ответ (${response.status}).`);
    }

    if (!response.ok || !result.success) {
        if (response.status === 401 && auth) {
            localStorage.removeItem('token');
            // Только если мы не на странице логина, перенаправляем
            if (window.location.pathname !== '/login.html') {
                location.href = 'login.html';
            }
        }
        throw new Error(result.message || 'Ошибка API.');
    }

    return result.data;
}
