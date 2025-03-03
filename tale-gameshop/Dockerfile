# Используем node:18 как базовый образ
FROM node:18

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем весь исходный код в контейнер
COPY . .

# Собираем фронтенд-приложение
RUN npm run build

# Копируем собранный фронтенд в директорию для Nginx
RUN cp -r /app/dist /frontend_build

# Не запускаем сервер, только копируем в /frontend_build
CMD ["tail", "-f", "/dev/null"]
