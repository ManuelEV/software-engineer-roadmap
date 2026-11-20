import type { TopicDef } from '../types'

/** Unit 3, first part: the interview process and live coding. */
export const topics: TopicDef[] = [
  {
    slug: 'proceso-de-entrevistas',
    title: 'Cómo es un proceso de entrevistas',
    summary:
      'Las etapas de un proceso técnico (screening, prueba online, live coding, system design, conductual, oferta), qué mide cada una y cómo repartir tu preparación.',
    minutes: 20,
    keywords: ['interview loop', 'onsite', 'phone screen', 'online assessment', 'hiring process', 'preparación', 'plan de estudio'],
    group: 'La entrevista',
    load: () => import('./proceso-de-entrevistas.mdx'),
  },
  {
    slug: 'otros-formatos',
    title: 'Take-home, code review y rondas con IA',
    summary:
      'Los formatos que no son pizarra: tareas para la casa, revisar código ajeno, depurar un repositorio, pair programming y las nuevas rondas con asistente de IA.',
    minutes: 18,
    keywords: ['take-home assignment', 'code review interview', 'debugging interview', 'pair programming', 'ai-assisted interview', 'code comprehension'],
    group: 'La entrevista',
    load: () => import('./otros-formatos.mdx'),
  },
  {
    slug: 'metodo-live-coding',
    title: 'El método para live coding',
    summary:
      'Cómo enfrentar un problema en vivo: aclarar, ejemplos, fuerza bruta, optimizar con Big-O, codificar pensando en voz alta y probar. Y qué hacer cuando te trabas.',
    minutes: 22,
    keywords: ['coding interview', 'big o', 'complexity', 'umpire', 'think aloud', 'constraints', 'leetcode'],
    group: 'Live coding',
    load: () => import('./metodo-live-coding.mdx'),
  },
  {
    slug: 'arrays-y-hashing',
    title: 'Arreglos, hashing y prefix sums',
    summary:
      'El patrón que más aparece: cambiar búsquedas O(n) por consultas O(1) con un diccionario o un conjunto. Two Sum, anagramas, top-K frecuentes y sumas de prefijos.',
    minutes: 26,
    keywords: ['hash map', 'hash set', 'two sum', 'group anagrams', 'top k frequent', 'prefix sum', 'subarray sum equals k'],
    group: 'Live coding',
    load: () => import('./arrays-y-hashing.mdx'),
  },
  {
    slug: 'two-pointers-y-sliding-window',
    title: 'Two pointers y sliding window',
    summary:
      'Dos índices que se mueven con una regla clara convierten muchos O(n²) en O(n): palíndromos, 3Sum, el contenedor con más agua y la subcadena más larga sin repetidos.',
    minutes: 26,
    keywords: ['two pointers', 'sliding window', '3sum', 'container with most water', 'longest substring without repeating characters', 'minimum window substring'],
    group: 'Live coding',
    load: () => import('./two-pointers-y-sliding-window.mdx'),
  },
  {
    slug: 'pilas-y-colas',
    title: 'Pilas, colas y la pila monótona',
    summary:
      'LIFO y FIFO aplicados: paréntesis balanceados, min stack, el siguiente mayor con una pila monótona y el máximo de una ventana con una deque.',
    minutes: 24,
    keywords: ['stack', 'queue', 'deque', 'monotonic stack', 'valid parentheses', 'daily temperatures', 'next greater element', 'sliding window maximum'],
    group: 'Live coding',
    load: () => import('./pilas-y-colas.mdx'),
  },
  {
    slug: 'busqueda-binaria',
    title: 'Búsqueda binaria',
    summary:
      'Más que buscar en un arreglo ordenado: invariantes que no fallan, el arreglo rotado y la búsqueda binaria sobre el espacio de respuestas.',
    minutes: 24,
    keywords: ['binary search', 'lower bound', 'rotated sorted array', 'binary search on answer', 'koko eating bananas', 'off by one'],
    group: 'Live coding',
    load: () => import('./busqueda-binaria.mdx'),
  },
  {
    slug: 'listas-enlazadas',
    title: 'Listas enlazadas',
    summary:
      'Punteros sin perderse: invertir una lista, fusionar dos ordenadas, detectar ciclos con la liebre y la tortuga, y armar una caché LRU.',
    minutes: 24,
    keywords: ['linked list', 'reverse linked list', 'merge two sorted lists', 'floyd cycle detection', 'fast and slow pointers', 'lru cache', 'dummy node'],
    group: 'Live coding',
    load: () => import('./listas-enlazadas.mdx'),
  },
  {
    slug: 'arboles',
    title: 'Árboles binarios y BST',
    summary:
      'Recorridos en profundidad y por niveles, cómo pensar recursivamente, validar un BST y encontrar el ancestro común más bajo.',
    minutes: 23,
    keywords: ['binary tree', 'bst', 'dfs', 'bfs', 'inorder', 'preorder', 'postorder', 'level order', 'lowest common ancestor', 'validate bst'],
    group: 'Live coding',
    load: () => import('./arboles.mdx'),
  },
  {
    slug: 'heaps-y-top-k',
    title: 'Heaps y problemas top-K',
    summary:
      'La cola de prioridad por dentro y sus usos de entrevista: el k-ésimo mayor, fusionar k listas y la mediana de un flujo con dos heaps.',
    minutes: 25,
    keywords: ['heap', 'priority queue', 'heapq', 'kth largest', 'top k', 'merge k sorted lists', 'median of data stream', 'two heaps'],
    group: 'Live coding',
    load: () => import('./heaps-y-top-k.mdx'),
  },
  {
    slug: 'grafos',
    title: 'Grafos: BFS, DFS y orden topológico',
    summary:
      'Representar un grafo, recorrerlo en anchura o profundidad, contar islas, detectar ciclos en dependencias y encontrar caminos más cortos.',
    minutes: 28,
    keywords: ['graph', 'bfs', 'dfs', 'number of islands', 'topological sort', 'course schedule', 'dijkstra', 'union find', 'shortest path'],
    group: 'Live coding',
    load: () => import('./grafos.mdx'),
  },
  {
    slug: 'backtracking',
    title: 'Backtracking',
    summary:
      'Explorar todas las opciones sin perderse: subconjuntos, permutaciones, combinaciones y N reinas, con una plantilla de elegir, explorar y deshacer.',
    minutes: 24,
    keywords: ['backtracking', 'recursion', 'subsets', 'permutations', 'combination sum', 'n-queens', 'word search', 'pruning'],
    group: 'Live coding',
    load: () => import('./backtracking.mdx'),
  },
  {
    slug: 'programacion-dinamica',
    title: 'Programación dinámica',
    summary:
      'Reconocer cuándo un problema es DP, definir el estado y la recurrencia, y pasar de memoización a tabla: escaleras, ladrón de casas, monedas y LCS.',
    minutes: 26,
    keywords: ['dynamic programming', 'dp', 'memoization', 'tabulation', 'coin change', 'house robber', 'longest common subsequence', 'knapsack', 'edit distance'],
    group: 'Live coding',
    load: () => import('./programacion-dinamica.mdx'),
  },
  {
    slug: 'intervalos-y-greedy',
    title: 'Intervalos y algoritmos greedy',
    summary:
      'Ordenar y barrer: fusionar intervalos, cuántas salas de reunión hacen falta, y cuándo una decisión golosa es correcta (y cómo argumentarlo).',
    minutes: 21,
    keywords: ['intervals', 'merge intervals', 'meeting rooms', 'sweep line', 'greedy', 'non-overlapping intervals', 'jump game', 'exchange argument'],
    group: 'Live coding',
    load: () => import('./intervalos-y-greedy.mdx'),
  },
]
