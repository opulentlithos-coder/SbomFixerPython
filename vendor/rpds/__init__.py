"""Pure-Python stand-in for the compiled `rpds-py` package.

Why it exists: rpds-py ships a compiled extension (.pyd / .so). Locked-down machines (bank laptops with
AppLocker / endpoint security) refuse to load such files ("DLL load failed ... Access is denied").
`referencing` and `jsonschema` only need a few small immutable containers, so they are provided here in plain
Python. Every "modifying" method returns a new object, exactly like the real package. Speed is lower for very
large collections, which is fine for schema registries.
"""

from __future__ import annotations

__all__ = ["HashTrieMap", "HashTrieSet", "List", "Queue"]


class HashTrieMap:
    __slots__ = ("_d", "_h")

    def __init__(self, value=None, **kwds):
        d = {}
        if value is not None:
            d.update(value._d if isinstance(value, HashTrieMap) else value)
        d.update(kwds)
        self._d = d
        self._h = None

    @classmethod
    def convert(cls, value):
        return value if isinstance(value, cls) else cls(value)

    @classmethod
    def fromkeys(cls, keys, value=None):
        return cls(dict.fromkeys(keys, value))

    @classmethod
    def _wrap(cls, d):
        new = cls.__new__(cls)
        new._d = d
        new._h = None
        return new

    def __class_getitem__(cls, item):
        return cls

    def __getitem__(self, key):
        return self._d[key]

    def __contains__(self, key):
        return key in self._d

    def __iter__(self):
        return iter(self._d)

    def __len__(self):
        return len(self._d)

    def __bool__(self):
        return bool(self._d)

    def get(self, key, default=None):
        return self._d.get(key, default)

    def keys(self):
        return self._d.keys()

    def values(self):
        return self._d.values()

    def items(self):
        return self._d.items()

    def insert(self, key, val):
        d = dict(self._d)
        d[key] = val
        return self._wrap(d)

    def remove(self, key):
        if key not in self._d:
            raise KeyError(key)
        d = dict(self._d)
        del d[key]
        return self._wrap(d)

    def discard(self, key):
        if key not in self._d:
            return self
        return self.remove(key)

    def update(self, *args, **kwds):
        d = dict(self._d)
        for other in args:
            d.update(other._d if isinstance(other, HashTrieMap) else other)
        d.update(kwds)
        return self._wrap(d)

    def __eq__(self, other):
        if isinstance(other, HashTrieMap):
            return self._d == other._d
        return NotImplemented

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    def __hash__(self):
        if self._h is None:
            self._h = hash(frozenset(self._d.items()))
        return self._h

    def __or__(self, other):
        return self.update(other)

    def __repr__(self):
        return f"HashTrieMap({self._d!r})"


class HashTrieSet:
    __slots__ = ("_s", "_h")

    def __init__(self, value=()):
        self._s = frozenset(value._s if isinstance(value, HashTrieSet) else value)
        self._h = None

    def __class_getitem__(cls, item):
        return cls

    def __contains__(self, item):
        return item in self._s

    def __iter__(self):
        return iter(self._s)

    def __len__(self):
        return len(self._s)

    def __bool__(self):
        return bool(self._s)

    def insert(self, value):
        if value in self._s:
            return self
        return HashTrieSet(self._s | {value})

    def remove(self, value):
        if value not in self._s:
            raise KeyError(value)
        return HashTrieSet(self._s - {value})

    def discard(self, value):
        if value not in self._s:
            return self
        return HashTrieSet(self._s - {value})

    def update(self, *iterables):
        s = set(self._s)
        for it in iterables:
            s.update(it._s if isinstance(it, HashTrieSet) else it)
        return HashTrieSet(s)

    def union(self, other):
        return self.update(other)

    def intersection(self, other):
        return HashTrieSet(self._s & frozenset(other))

    def difference(self, other):
        return HashTrieSet(self._s - frozenset(other))

    def symmetric_difference(self, other):
        return HashTrieSet(self._s ^ frozenset(other))

    def __or__(self, other):
        return self.union(other)

    def __and__(self, other):
        return self.intersection(other)

    def __sub__(self, other):
        return self.difference(other)

    def __xor__(self, other):
        return self.symmetric_difference(other)

    def __eq__(self, other):
        if isinstance(other, HashTrieSet):
            return self._s == other._s
        return NotImplemented

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    def __hash__(self):
        if self._h is None:
            self._h = hash(self._s)
        return self._h

    def __repr__(self):
        return f"HashTrieSet({set(self._s)!r})"


class List:
    """Persistent singly linked list (cheap push_front / drop_first)."""

    __slots__ = ("_first", "_rest", "_len")

    def __init__(self, value=()):
        self._first = None
        self._rest = None
        self._len = 0
        for item in reversed(list(value)):
            self._first, self._rest, self._len = item, self._clone(), self._len + 1

    def _clone(self):
        new = List.__new__(List)
        new._first, new._rest, new._len = self._first, self._rest, self._len
        return new

    def __class_getitem__(cls, item):
        return cls

    @property
    def first(self):
        if not self._len:
            raise IndexError("empty list has no first element")
        return self._first

    @property
    def rest(self):
        if not self._len:
            return self
        return self._rest

    def push_front(self, value):
        new = List.__new__(List)
        new._first, new._rest, new._len = value, self, self._len + 1
        return new

    def drop_first(self):
        if not self._len:
            raise IndexError("empty list")
        return self._rest

    def __len__(self):
        return self._len

    def __bool__(self):
        return self._len > 0

    def __iter__(self):
        node = self
        while node._len:
            yield node._first
            node = node._rest

    def __reversed__(self):
        return iter(list(self)[::-1])

    def __eq__(self, other):
        if isinstance(other, List):
            return list(self) == list(other)
        return NotImplemented

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    def __hash__(self):
        return hash(tuple(self))

    def __repr__(self):
        return f"List({list(self)!r})"


class Queue:
    """Persistent FIFO queue."""

    __slots__ = ("_items",)

    def __init__(self, value=()):
        self._items = tuple(value)

    def __class_getitem__(cls, item):
        return cls

    @property
    def peek(self):
        if not self._items:
            raise IndexError("peeked an empty queue")
        return self._items[0]

    def enqueue(self, value):
        return Queue(self._items + (value,))

    def dequeue(self):
        if not self._items:
            raise IndexError("dequeued an empty queue")
        return Queue(self._items[1:])

    def __len__(self):
        return len(self._items)

    def __bool__(self):
        return bool(self._items)

    def __iter__(self):
        return iter(self._items)

    def __eq__(self, other):
        if isinstance(other, Queue):
            return self._items == other._items
        return NotImplemented

    def __hash__(self):
        return hash(self._items)

    def __repr__(self):
        return f"Queue({list(self._items)!r})"
