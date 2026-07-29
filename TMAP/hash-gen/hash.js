const bcrypt = require('bcrypt');

// !!! ЗАМЕНИТЕ admin123 НА СВОЙ ПАРОЛЬ !!!
const password = 'admin123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Ошибка:', err);
    } else {
        console.log('Хеш для пароля "' + password + '":', hash);
    }
});