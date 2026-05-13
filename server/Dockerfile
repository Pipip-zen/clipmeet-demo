FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads clips

EXPOSE 3001

CMD ["npm", "start"]