# Urna 2026 · Simulador

Simulador **não oficial** de urna eletrônica para treinar o voto do 1º turno das Eleições Gerais de 2026 (4 de outubro), com as candidaturas registradas no TSE.

**No ar:** https://urna-2026-eight.vercel.app

## O que tem

- Escolha do estado e votação na ordem da urna: Deputado Federal, Deputado Estadual/Distrital, Senador (1ª e 2ª vaga), Governador e Presidente.
- Candidaturas reais de todos os estados, com vice e suplentes, e foto oficial do registro no TSE (DivulgaCand).
- Tela no layout do simulador oficial do TSE de 2026: voto nominal, de legenda, branco e nulo.
- Sons com os mesmos parâmetros do simulador oficial (onda quadrada, 2300/2200 Hz).
- Teclas com braile, como na urna.
- Colinha: digite o número e veja o nome correspondente; o voto confirmado na urna vai para a colinha. Fica salva no navegador, por estado, e pode ser exportada como imagem, impressão/PDF ou texto.

## Rodar localmente

Não há build. Abra `index.html` no navegador ou sirva a pasta:

```sh
npx http-server -p 5178
```

## Atualizar os candidatos

```sh
node scripts/build-data.mjs
```

Baixa as fichas compiladas pelo Nexo Jornal a partir dos registros do TSE e gera `data/BR.js` e `data/<UF>.js`. Candidaturas indeferidas ou retiradas ficam de fora. Rode de novo antes da eleição para pegar mudanças de última hora.

## Deploy

```sh
npx vercel deploy --prod --yes
```

## Aviso

Nenhum voto é registrado ou enviado. Para o treino oficial, use o [simulador do TSE](https://www.tse.jus.br/eleicoes/simulador-de-votacao). O celular não pode entrar na cabine de votação: leve a colinha impressa ou anotada.
