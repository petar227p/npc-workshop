.PHONY: setup dev test typecheck check docker

setup:
	npm install
	test -f .env || cp .env.example .env

dev:
	npm run dev

test:
	npm test

typecheck:
	npm run typecheck

check: typecheck test

docker:
	docker compose up --build
