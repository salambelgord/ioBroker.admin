function initMap () {
    gMain.dialogs.system.mapLoaded = true;
    gMain.dialogs.system.updateMap(true);
}

function System(main) {
    'use strict';
    var that    = this;
    var $dialog = $('#dialog-system');
    this.main   = main;

    this.systemRepos  = null;
    this.systemCerts  = null;
    this.mapLoaded    = false;
    var mapTimer;
    var mapInited;
    var longitude;
    var latitude;

    function string2cert(name, str) {
        if (str.length < 700 && (str.indexOf('/') !== -1 || str.indexOf('\\') !== -1)) {
            // it is a path
            return str;
        }
        // expected format: -----BEGIN CERTIFICATE-----certif...icate==-----END CERTIFICATE-----
        if (str.length < '-----BEGIN CERTIFICATE-----==-----END CERTIFICATE-----'.length) {
            showMessage(_('Invalid certificate "%s". To short.', name), true);
            return '';
        }
        var lines = [];
        if (str.substring(0, '-----BEGIN RSA PRIVATE KEY-----'.length) === '-----BEGIN RSA PRIVATE KEY-----') {
            if (str.substring(str.length -  '-----END RSA PRIVATE KEY-----'.length) !== '-----END RSA PRIVATE KEY-----') {
                showMessage(_('Certificate "%s" must end with "-----END RSA PRIVATE KEY-----".', name), true);
                return '';
            }
            str = str.substring('-----BEGIN RSA PRIVATE KEY-----'.length);
            str = str.substring(0, str.length - '-----END RSA PRIVATE KEY-----'.length);
            str = str.replace(/\s/g, '');
            while (str.length) {
                lines.push(str.substring(0, 64));
                str = str.substring(64);
            }
            return '-----BEGIN RSA PRIVATE KEY-----\r\n' + lines.join('\r\n') + '\r\n-----END RSA PRIVATE KEY-----\r\n';
        } else if (str.substring(0, '-----BEGIN PRIVATE KEY-----'.length) === '-----BEGIN PRIVATE KEY-----') {
            if (str.substring(str.length -  '-----END PRIVATE KEY-----'.length) !== '-----END PRIVATE KEY-----') {
                showMessage(_('Certificate "%s" must end with "-----BEGIN PRIVATE KEY-----".', name), true);
                return '';
            }
            str = str.substring('-----BEGIN PRIVATE KEY-----'.length);
            str = str.substring(0, str.length - '-----END PRIVATE KEY-----'.length);
            str = str.replace(/\s/g, '');
            while (str.length) {
                lines.push(str.substring(0, 64));
                str = str.substring(64);
            }
            return '-----BEGIN PRIVATE KEY-----\r\n' + lines.join('\r\n') + '\r\n-----END PRIVATE KEY-----\r\n';
        } else {
            if (str.substring(0, '-----BEGIN CERTIFICATE-----'.length) !== '-----BEGIN CERTIFICATE-----') {
                showMessage(_('Certificate "%s" must start with "-----BEGIN CERTIFICATE-----".', name), true);
                return '';
            }
            if (str.substring(str.length -  '-----END CERTIFICATE-----'.length) !== '-----END CERTIFICATE-----') {
                showMessage(_('Certificate "%s" must end with "-----END CERTIFICATE-----".', name), true);
                return '';
            }
            // process chained certificates
            var parts = str.split('-----END CERTIFICATE-----');
            for (var p = parts.length - 1; p >= 0; p--) {
                if (!parts[p].replace(/[\r\n|\r|\n]+/, '').trim()) {
                    parts.splice(p, 1);
                    continue;
                }
                str = parts[p];
                str = str.substring('-----BEGIN CERTIFICATE-----'.length);
                str = str.replace(/\s/g, '');
                lines = [];
                while (str.length) {
                    lines.push(str.substring(0, 64));
                    str = str.substring(64);
                }
                parts[p] = '-----BEGIN CERTIFICATE-----\r\n' + lines.join('\r\n') + '\r\n-----END CERTIFICATE-----\r\n';
            }

            return parts.join('');
        }
    }

    function cert2string(cert) {
        return cert.replace(/(?:\\[rn]|[\r\n]+)+/g, '');
    }

    function addCert(name, text) {
        // Get data and Names
        var values = table2values('tab-system-certs');
        var ids = [];
        for (var d = 0; d < values.length; d++) {
            ids.push(values[d].name);
        }
        // Find new unique name
        var found;
        var newText = name || _('New');
        var idx = 1;
        do {
            found = ids.indexOf(newText + idx) !== -1;
            if (found) {
                idx++;
            }
        } while (found);

        values.push({name: newText + idx, certificate: text || ''});
        values2table('tab-system-certs', values);
    }

    // ----------------------------- Repositories show and Edit ------------------------------------------------
    function initRepoGrid(/* update */) {
        if (that.systemRepos && that.systemRepos.native.repositories) {
            var values = [];
            // list of the repositories
            for (var repo in that.systemRepos.native.repositories) {
                if (!that.systemRepos.native.repositories.hasOwnProperty(repo)) continue;
                var obj = that.systemRepos.native.repositories[repo];

                values.push({
                    name:    repo,
                    link:    (typeof obj === 'object') ? obj.link : obj
                });
            }

            values2table('tab-system-repo', values, {
                onChange: function (attr /* , index */) {
                    $dialog.find('.btn-save').removeClass('disabled');
                    if (!attr || attr === 'name') {
                        updateRepoListSelect();
                    }
                }
            });
        } else {
            $('#tab-system-repo').html(_('permissionError'));
        }
    }

    function updateRepoListSelect() {
        var $system_activeRepo = $('#system_activeRepo');
        var selectedRepo = $system_activeRepo.val();
        var isFound = false;
        $system_activeRepo.html('');
        var data = table2values('tab-system-repo');
        for (var i = 0; i < data.length; i++) {
            $system_activeRepo.append('<option value="' + data[i].name + '">' + data[i].name + '</option>');
            if (selectedRepo === data[i].name) {
                isFound = true;
            }
        }
        if (isFound) $system_activeRepo.val(selectedRepo);
        $system_activeRepo.select();
    }

    // ----------------------------- Certificates show and Edit ------------------------------------------------
    function initCertsGrid() {
        var $dropZone = $('#tab-system-certs');
        if (that.systemCerts && that.systemCerts.native.certificates) {
            var values = [];
            // list of the repositories
            for (var cert in that.systemCerts.native.certificates) {
                if (!that.systemCerts.native.certificates.hasOwnProperty(cert)) continue;

                values.push({
                    name:        cert,
                    certificate: cert2string(that.systemCerts.native.certificates[cert])
                });
            }
            values2table('tab-system-certs', values, {
                onChange: function (attr /* , index */) {
                    $dialog.find('.btn-save').removeClass('disabled');
                }
            });
        } else {
            $dropZone.html(_('permissionError'));
        }

        installFileUpload($dropZone, 10000, function (err, text) {
            if (err) {
                showMessage(err, true);
            } else {
                try {
                    text = atob(text.split(',')[1]); // string has form data:;base64,TEXT==
                } catch (err) {
                    showMessage(_('Cannot read file!'), true);
                    return;
                }
                text = text.replace(/(\r\n|\n|\r)/gm, '');
                if (text.indexOf('BEGIN RSA PRIVATE KEY') !== -1) {
                    addCert('private', text);
                } else if (text.indexOf('BEGIN PRIVATE KEY') !== -1) {
                    addCert('private', text);
                } else if (text.indexOf('BEGIN CERTIFICATE') !== -1) {
                    var m = text.split('-----END CERTIFICATE-----');
                    var count = 0;
                    for (var _m = 0; _m < m.length; _m++) {
                        if (m[_m].replace(/[\r\n]+|\n|\r/, '').trim()) count++;
                    }
                    if (count > 1) {
                        addCert('chained', text);
                    } else {
                        addCert('public', text);
                    }
                } else {
                    showMessage(_('Unknown file format!'), true);
                }
            }
        });
    }

    function updateCertListSelect() {
        // todo
    }

    function showMessage(text, isError, duration) {
        that.main.showToast($('#tab-system-certs'), text, null, duration, isError);
    }

    function initRights() {
        that.main.systemConfig.common.defaultNewAcl = that.main.systemConfig.common.defaultNewAcl || {};
        var acl = that.main.systemConfig.common.defaultNewAcl;

        // fill users
        var text = '';
        for (var u = 0; u < that.main.tabs.users.list.length; u++) {
            text += '<option value="' + that.main.tabs.users.list[u] + '">' + (that.main.objects[that.main.tabs.users.list[u]].common.name || that.main.tabs.users.list[u]) + '</option>';
        }
        $dialog.find('#tab-system-acl-owner').html(text).val(acl.owner || 'system.user.admin');

        // fill groups
        text = '';
        for (u = 0; u < that.main.tabs.users.groups.length; u++) {
            text += '<option value="' + that.main.tabs.users.groups[u] + '">' + (that.main.objects[that.main.tabs.users.groups[u]].common.name || that.main.tabs.users.groups[u]) + '</option>';
        }
        $dialog.find('#tab-system-acl-group').html(text).val(acl.ownerGroup || 'system.group.administrator');

        if (acl.object === undefined) acl.object = 0x664;

        $dialog.find('#tab-system-acl-obj-owner-read') .prop('checked', acl.object & 0x400);
        $dialog.find('#tab-system-acl-obj-owner-write').prop('checked', acl.object & 0x200);
        $dialog.find('#tab-system-acl-obj-group-read'). prop('checked', acl.object & 0x40);
        $dialog.find('#tab-system-acl-obj-group-write').prop('checked', acl.object & 0x20);
        $dialog.find('#tab-system-acl-obj-every-read'). prop('checked', acl.object & 0x4);
        $dialog.find('#tab-system-acl-obj-every-write').prop('checked', acl.object & 0x2);

        if (acl.state === undefined) acl.state = 0x664;

        $dialog.find('#tab-system-acl-state-owner-read') .prop('checked', acl.state & 0x400);
        $dialog.find('#tab-system-acl-state-owner-write').prop('checked', acl.state & 0x200);
        $dialog.find('#tab-system-acl-state-group-read'). prop('checked', acl.state & 0x40);
        $dialog.find('#tab-system-acl-state-group-write').prop('checked', acl.state & 0x20);
        $dialog.find('#tab-system-acl-state-every-read'). prop('checked', acl.state & 0x4);
        $dialog.find('#tab-system-acl-state-every-write').prop('checked', acl.state & 0x2);

        if (acl.file === undefined) acl.file = 0x664;
        $dialog.find('#tab-system-acl-file-owner-read') .prop('checked', acl.file & 0x400);
        $dialog.find('#tab-system-acl-file-owner-write').prop('checked', acl.file & 0x200);
        $dialog.find('#tab-system-acl-file-group-read'). prop('checked', acl.file & 0x40);
        $dialog.find('#tab-system-acl-file-group-write').prop('checked', acl.file & 0x20);
        $dialog.find('#tab-system-acl-file-every-read'). prop('checked', acl.file & 0x4);
        $dialog.find('#tab-system-acl-file-every-write').prop('checked', acl.file & 0x2);

        // workaround for materialize checkbox problem
        $dialog.find('input[type="checkbox"]+span').off('click').on('click', function () {
            var $input = $(this).prev();
            if (!$input.prop('disabled')) {
                $input.prop('checked', !$input.prop('checked')).trigger('change');
            }
        });
    }

    function finishEditingRights () {
        that.main.systemConfig.common.defaultNewAcl = that.main.systemConfig.common.defaultNewAcl || {};
        var acl = that.main.systemConfig.common.defaultNewAcl;
        var old = JSON.stringify(acl);
        acl.object = 0;
        acl.object |= $dialog.find('#tab-system-acl-obj-owner-read').prop('checked')  ? 0x400 : 0;
        acl.object |= $dialog.find('#tab-system-acl-obj-owner-write').prop('checked') ? 0x200 : 0;
        acl.object |= $dialog.find('#tab-system-acl-obj-group-read').prop('checked')  ? 0x40  : 0;
        acl.object |= $dialog.find('#tab-system-acl-obj-group-write').prop('checked') ? 0x20  : 0;
        acl.object |= $dialog.find('#tab-system-acl-obj-every-read').prop('checked')  ? 0x4   : 0;
        acl.object |= $dialog.find('#tab-system-acl-obj-every-write').prop('checked') ? 0x2   : 0;

        acl.owner = $dialog.find('#tab-system-acl-owner').val();
        acl.ownerGroup = $dialog.find('#tab-system-acl-group').val();

        acl.state = 0;
        acl.state |= $dialog.find('#tab-system-acl-state-owner-read').prop('checked')  ? 0x400 : 0;
        acl.state |= $dialog.find('#tab-system-acl-state-owner-write').prop('checked') ? 0x200 : 0;
        acl.state |= $dialog.find('#tab-system-acl-state-group-read').prop('checked')  ? 0x40  : 0;
        acl.state |= $dialog.find('#tab-system-acl-state-group-write').prop('checked') ? 0x20  : 0;
        acl.state |= $dialog.find('#tab-system-acl-state-every-read').prop('checked')  ? 0x4   : 0;
        acl.state |= $dialog.find('#tab-system-acl-state-every-write').prop('checked') ? 0x2   : 0;

        acl.file = 0;
        acl.file |= $dialog.find('#tab-system-acl-file-owner-read').prop('checked')  ? 0x400 : 0;
        acl.file |= $dialog.find('#tab-system-acl-file-owner-write').prop('checked') ? 0x200 : 0;
        acl.file |= $dialog.find('#tab-system-acl-file-group-read').prop('checked')  ? 0x40  : 0;
        acl.file |= $dialog.find('#tab-system-acl-file-group-write').prop('checked') ? 0x20  : 0;
        acl.file |= $dialog.find('#tab-system-acl-file-every-read').prop('checked')  ? 0x4   : 0;
        acl.file |= $dialog.find('#tab-system-acl-file-every-write').prop('checked') ? 0x2   : 0;
        return old !== JSON.stringify(acl);
    }

    function requestInfo(callback) {
        that.main.socket.emit('getObject', 'system.repositories', function (errRepo, repo) {
            that.systemRepos = repo;
            that.main.socket.emit('getObject', 'system.certificates', function (errCerts, certs) {
                that.systemCerts = certs;
                that.main.socket.emit('getObject', 'system.config', function (errConfig, config) {
                    that.main.systemConfig = config;
                    callback(errRepo || errCerts || errConfig);
                });
            });
        });
    }

    function onButtonSave() {
        var common = that.main.systemConfig.common;
        var languageChanged   = false;
        var activeRepoChanged = false;

        finishEditingRights();

        $dialog.find('.system-settings.value').each(function () {
            var $this = $(this);
            var id = $this.attr('id');
            if (!id) return;
            id = id.substring('system_'.length);

            if ($this.attr('type') === 'checkbox') {
                common[id] = $this.prop('checked');
            } else {
                if (id === 'language'   && common.language   !== $this.val()) languageChanged   = true;
                if (id === 'activeRepo' && common.activeRepo !== $this.val()) activeRepoChanged = true;
                common[id] = $this.val();
                if (id === 'isFloatComma') {
                    common[id] = (common[id] === 'true' || common[id] === true);
                }
            }
        });

        // Fill the repositories list
        var links = {};
        if (that.systemRepos) {
            for (var r in that.systemRepos.native.repositories) {
                if (that.systemRepos.native.repositories.hasOwnProperty(r) && typeof that.systemRepos.native.repositories[r] === 'object' && that.systemRepos.native.repositories[r].json) {
                    links[that.systemRepos.native.repositories[r].link] = that.systemRepos.native.repositories[r].json;
                }
            }
            that.systemRepos.native.repositories = {};
        }

        var data = table2values('tab-system-repo');
        if (that.systemRepos) {
            var first = null;
            for (var i = 0; i < data.length; i++) {
                that.systemRepos.native.repositories[data[i].name] = {link: data[i].link, json: null};
                if (links[data[i].link]) that.systemRepos.native.repositories[data[i].name].json = links[data[i].link];
                if (!first) first = data[i].name;
            }
            // Check if the active repository still exist in the list
            if (!first) {
                if (common.activeRepo) {
                    activeRepoChanged = true;
                    common.activeRepo = '';
                }
            } else if (!that.systemRepos.native.repositories[common.activeRepo]) {
                activeRepoChanged = true;
                common.activeRepo = first;
            }
        }
        common.diag = $dialog.find('#diagMode').val();

        if (that.systemCerts) {
            // Fill the certificates list
            that.systemCerts.native.certificates = {};
            data = table2values('tab-system-certs');
            for (var j = 0; j < data.length; j++) {
                that.systemCerts.native.certificates[data[j].name] = string2cert(data[j].name, data[j].certificate);
            }

            $dialog.find('.system-le-settings.value').each(function () {
                var $this = $(this);
                var id = $this.data('name');

                if ($this.attr('type') === 'checkbox') {
                    that.systemCerts.native.letsEncrypt[id] = $this.prop('checked');
                } else {
                    that.systemCerts.native.letsEncrypt[id] = $this.val();
                }
            });
        }

        that.main.socket.emit('extendObject', 'system.config', {common: common}, function (err) {
            if (!err) {
                that.main.socket.emit('extendObject', 'system.repositories', that.systemRepos, function () {
                    that.main.socket.emit('extendObject', 'system.certificates', that.systemCerts, function () {
                        $dialog.find('.btn-save').addClass('disabled');
                        if (languageChanged) {
                            window.location.reload();
                        } else {
                            that.main.navigate();
                            if (activeRepoChanged) {
                                setTimeout(function () {
                                    that.main.tabs.adapters.init(true);
                                }, 0);
                            }
                        }
                    });
                });
            } else {
                that.main.showError(err);
            }
        });
    }

    this.updateMap = function (immediately) {
        if (!this.mapLoaded) return;
        if (!immediately) {
            clearTimeout(mapTimer);
            mapTimer = setTimeout(function () {
                that.updateMap(true);
            }, 1000);
            return;
        }
        if (mapTimer) {
            clearTimeout(mapTimer);
            mapTimer = null;
        }

        if (latitude || longitude) {
            var map = new google.maps.Map($dialog.find('.map')[0], {
                zoom:       14,
                center:     {lat: parseFloat(latitude), lng: parseFloat(longitude)}
            });

            var marker = new google.maps.Marker({
                position:   {lat: parseFloat(latitude), lng: parseFloat(longitude)},
                map:        map,
                title:      _('Your home')
            });
        }
    };

    function preInitMap() {
        if (!mapInited) {
            mapInited = true;
            var key1 = 'AIzaSyCIrBRZfZAE';
            var key2 = '_0C1OplAUy7OXhiWLoZc3eY';
            var key = key1 + key2;

            // load google API
            $.ajax({
                // please do not miss use this api key!
                url: 'https://maps.googleapis.com/maps/api/js?key=' + key + '&signed_in=true&callback=initMap',
                dataType: 'script',
                cache: true
            });
        }
    }

    function initTab(id) {
        if (id === 'tab-system-main') {
            that.updateMap();
        }

        // Detect materialize
        if ((id === 'tab-system-letsencrypt' || id === 'tab-system-main' || id === 'tab-system-acl') && window.M && window.M.toast) {
            M.updateTextFields('#' + id);
            $dialog.find('optgroup').each(function () {
                if (!$(this).data('lang')) {
                    var label = $(this).attr('label');
                    $(this).data('lang', label);
                    $(this).attr('label', _(label));
                }
            });

            $dialog.find('select').select();
        } else
        if (id === 'tab-system-certs') {
            showMessage(_('Drop the files here'));
        }
    }

    this.init = function () {
        if (this.inited) {
            return;
        }
        this.inited = true;
        // request all info anew
        requestInfo(function (error) {
            if (error) {
                console.error(error);
                showMessage(error, true);
                return;
            }
            var $system_activeRepo = $dialog.find('#system_activeRepo');
            $system_activeRepo.html('');
            if (that.systemRepos && that.systemRepos.native.repositories) {
                for (var repo in that.systemRepos.native.repositories) {
                    $system_activeRepo.append('<option value="' + repo + '">' + repo + '</option>');
                }
            } else {
                $dialog.find('#tab-system-repo').html(_('permissionError'));
            }

            $dialog.find('#diagMode')
                .val(that.main.systemConfig.common.diag)
                .on('change', function () {
                    that.main.socket.emit('sendToHost', that.main.currentHost, 'getDiagData', $(this).val(), function (obj) {
                        $dialog.find('#diagSample').html(JSON.stringify(obj, null, 2));
                    });
                })
                .trigger('change');

            // collect all history instances
            var $system_defaultHistory = $dialog.find('#system_defaultHistory');
            $system_defaultHistory.html('<option value=""></option>');
            for (var id = 0; id < that.main.instances.length; id++) {
                if (main.objects[main.instances[id]].common.type === 'storage') {
                    $system_defaultHistory.append('<option value="' + that.main.instances[id].substring('system.adapter.'.length) + '">' + main.instances[id].substring('system.adapter.'.length) + '</option>');
                }
            }
            longitude = that.main.systemConfig.common.longitude;
            latitude  = that.main.systemConfig.common.latitude;
            preInitMap();

            $dialog.find('.system-settings.value').each(function () {
                var $this = $(this);
                var id = $this.attr('id');
                if (!id) return;
                id = id.substring('system_'.length);

                if ($this.attr('type') === 'checkbox') {
                    $this.prop('checked', that.main.systemConfig.common[id]);
                } else {
                    if (id === 'isFloatComma') {
                        $this.val(that.main.systemConfig.common[id] ? 'true' : 'false');
                    } else {
                        $this.val(that.main.systemConfig.common[id]);
                    }
                }
            });

            $dialog.find('#system_latitude').off('change').on('change', function () {
                latitude = $(this).val();
                that.updateMap();
            }).off('keyup').on('keyup', function () {
                $(this).trigger('change');
            });

            $dialog.find('#system_longitude').off('change').on('change', function () {
                longitude = $(this).val();
                that.updateMap();
            }).off('keyup').on('keyup', function () {
                $(this).trigger('change');
            });
            if (!that.systemCerts.native.letsEncrypt) {
                that.systemCerts.native.letsEncrypt = {
                    path: 'letsencrypt'
                };
            }

            $dialog.find('.system-le-settings.value').each(function () {
                var $this = $(this);
                var id = $this.data('name');
                if (that.systemCerts && that.systemCerts.native.letsEncrypt) {
                    if ($this.attr('type') === 'checkbox') {
                        $this.prop('checked', that.systemCerts.native.letsEncrypt[id]);
                    } else {
                        $this.val(that.systemCerts.native.letsEncrypt[id]);
                    }
                }
            });

            var $tabs = $dialog.find('#tabs-system');

            $tabs.find('.tabs').mtabs({
                onShow: function (tab)  {
                    if (!tab) return;
                    initTab($(tab).attr('id'));
                }
            });

            $dialog.find('.dialog-system-buttons .btn-save').off('click').on('click', onButtonSave);
            $dialog.find('.dialog-system-buttons .btn-cancel').off('click').on('click', function () {
                that.main.navigate();
            });

            initRepoGrid();
            initRights();
            initCertsGrid();

            $dialog.find('.value').on('change', function () {
                $dialog.find('.btn-save').removeClass('disabled');
            }).on('keyup', function () {
                $(this).trigger('change');
            });

            $dialog.find('.btn-save').addClass('disabled');

            initTab('tab-system-main');
        });
    };

    this.destroy = function () {
        if (this.inited) {
            this.inited = false;
        }
    };

    this.allStored = function () {
        return $dialog.find('.btn-save').hasClass('disabled');
    };

    this.prepare = function () {
        if (!that.main.systemConfig.error) {
            $('#button-system').off('click').on('click', function () {
                that.main.navigate({dialog: 'system'});
            });
        } else {
            $('#button-system').hide();
        }
    };
}