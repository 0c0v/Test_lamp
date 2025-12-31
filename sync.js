(function () {
    'use strict';

    function AccountSync() {
        var listener = Lampa.Subscriber();
        var api_url = ''; // Будет установлено из настроек
        var token = '';

        // Какие данные Lampa мы будем синхронизировать
        const SYNC_KEYS = [
            'view_history', 'view_history_movie', 'view_torrents', 'timetable',
            'file_view_history', 'online_last_episode', 'online_last_season',
            'torrents_history', 'favorite', 'favorite_history', 'favorite_notice'
        ];

        // Инициализация плагина
        this.create = function () {
            Lampa.Listener.follow('app', (e) => {
                if (e.type == 'ready') {
                    init();
                }
            });
        };

        // Запуск плагина
        this.start = function () {};
        this.destroy = function () {};

        function init() {
            api_url = Lampa.Storage.get('account_sync_api_url', '');
            token = Lampa.Storage.get('account_sync_token', '');
            addSettings();
        }

        // --- UI (Интерфейс) ---

        function addSettings() {
            var settings_view = `
                <div class="settings-folder">
                    <div class="settings-folder__item selector" data-action="server">
                        <div class="settings-folder__name">Адрес сервера</div>
                        <div class="settings-folder__value">${api_url}</div>
                    </div>
                    <div class="settings-folder__item selector" data-action="login">
                        <div class="settings-folder__name">Войти / Сменить аккаунт</div>
                    </div>
                    <div class="settings-folder__item selector" data-action="register">
                        <div class="settings-folder__name">Зарегистрироваться</div>
                    </div>
                    <div class="settings-folder__item selector" data-action="sync_manual">
                        <div class="settings-folder__name">Синхронизировать сейчас</div>
                    </div>
                    <div class="settings-folder__item selector" data-action="logout">
                        <div class="settings-folder__name">Выйти</div>
                    </div>
                </div>`;

            var account_item = $(`<div class="settings-param selector" data-name="account_sync">
                <div class="settings-param__name">Локальная синхронизация</div>
                <div class="settings-param__value"></div>
            </div>`);

            account_item.on('hover:enter', () => {
                Lampa.Select.show({
                    title: 'Локальная синхронизация',
                    items: $(settings_view),
                    onSelect: (a) => {
                        var action = a.data('action');
                        handleAction(action);
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('settings_component');
                    }
                });
            });

            $('.settings-start .settings-param:last-child').after(account_item);
        }

        function handleAction(action) {
            switch (action) {
                case 'server':
                    setServerAddress();
                    break;
                case 'login':
                    showLogin();
                    break;
                case 'register':
                    showRegister();
                    break;
                case 'sync_manual':
                    if (token) {
                        Lampa.Noty.show('Начинаю синхронизацию...');
                        pushData();
                    } else {
                        Lampa.Noty.show('Сначала войдите в аккаунт', { time: 3000 });
                    }
                    break;
                case 'logout':
                    logout();
                    break;
            }
        }

        function setServerAddress() {
            Lampa.Input.edit({
                title: 'Адрес сервера',
                value: api_url,
                free: true,
                nosave: true
            }, (new_url) => {
                if (new_url) {
                    api_url = new_url;
                    Lampa.Storage.set('account_sync_api_url', api_url);
                    Lampa.Noty.show('Адрес сервера сохранен');
                    $('.settings-folder__item[data-action="server"] .settings-folder__value').text(api_url);
                }
                Lampa.Controller.toggle('settings_component');
            });
        }

        function showLogin() {
            if (!api_url) {
                Lampa.Noty.show('Сначала укажите адрес сервера', { time: 4000 });
                Lampa.Controller.toggle('settings_component');
                return;
            }
            showUserPassForm('Вход', (username, password) => {
                login(username, password);
            });
        }
        
        function showRegister() {
            if (!api_url) {
                Lampa.Noty.show('Сначала укажите адрес сервера', { time: 4000 });
                Lampa.Controller.toggle('settings_component');
                return;
            }
            showUserPassForm('Регистрация', (username, password) => {
                register(username, password);
            });
        }

        function showUserPassForm(title, callback) {
            Lampa.Input.edit({ title: 'Имя пользователя', free: true, nosave: true }, (username) => {
                if (username) {
                    Lampa.Input.edit({ title: 'Пароль', free: true, nosave: true, password: true }, (password) => {
                        if (password) {
                            callback(username, password);
                        } else {
                            Lampa.Controller.toggle('settings_component');
                        }
                    });
                } else {
                    Lampa.Controller.toggle('settings_component');
                }
            });
        }
        
        // --- API (Взаимодействие с сервером) ---

        function register(username, password) {
            fetch(api_url + '/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(r => r.json())
            .then(data => {
                Lampa.Noty.show(data.message, { time: 4000 });
            })
            .catch(err => {
                Lampa.Noty.show('Ошибка регистрации', { time: 4000 });
                console.error('Sync Register Error:', err);
            })
            .finally(() => Lampa.Controller.toggle('settings_component'));
        }

        function login(username, password) {
            fetch(api_url + '/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(r => r.json())
            .then(data => {
                if (data.token) {
                    token = data.token;
                    Lampa.Storage.set('account_sync_token', token);
                    Lampa.Noty.show('Вход выполнен успешно. Загрузка данных...');
                    pullData(); // Загружаем данные после входа
                } else {
                    Lampa.Noty.show(data.message || 'Ошибка входа', { time: 4000 });
                }
            })
            .catch(err => {
                Lampa.Noty.show('Ошибка входа', { time: 4000 });
                console.error('Sync Login Error:', err);
            })
            .finally(() => Lampa.Controller.toggle('settings_component'));
        }
        
        function logout() {
            token = '';
            Lampa.Storage.set('account_sync_token', '');
            Lampa.Noty.show('Вы вышли из аккаунта');
            Lampa.Controller.toggle('settings_component');
        }

        // --- SYNC (Логика синхронизации) ---

        // Отправить данные на сервер
        function pushData() {
            if (!token) return;

            let data_to_sync = {};
            SYNC_KEYS.forEach(key => {
                data_to_sync[key] = Lampa.Storage.get(key, '{}');
            });
            
            fetch(api_url + '/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(data_to_sync)
            })
            .then(r => r.json())
            .then(data => Lampa.Noty.show(data.message, { time: 3000 }))
            .catch(err => console.error('Sync Push Error:', err));
        }

        // Получить данные с сервера
        function pullData() {
            if (!token) return;

            fetch(api_url + '/api/sync', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(r => r.json())
            .then(server_data => {
                if (Object.keys(server_data).length > 0) {
                    SYNC_KEYS.forEach(key => {
                        if(server_data[key]) {
                             Lampa.Storage.set(key, server_data[key]);
                        }
                    });
                    Lampa.Noty.show('Данные восстановлены с сервера', { time: 4000 });
                    setTimeout(Lampa.Utils.reload, 1000); // Перезагружаем интерфейс для применения
                } else {
                     Lampa.Noty.show('На сервере пока нет данных', { time: 3000 });
                }
            })
            .catch(err => console.error('Sync Pull Error:', err));
        }

        // Автоматическая синхронизация при изменении данных
        Lampa.Storage.listener.follow('change', (e) => {
            if (token && SYNC_KEYS.includes(e.name)) {
                // Ставим небольшую задержку, чтобы не отправлять данные на каждое мелкое изменение
                setTimeout(pushData, 5000); 
            }
        });
    }

    if (!window.plugin_account_sync_stb) {
        window.plugin_account_sync_stb = new AccountSync();
        window.plugin_account_sync_stb.create();
    }

})();
