import { concat, never, Observable, of, Subject, throwError } from 'rxjs';
import { distinctUntilChanged, map, materialize, switchAll } from 'rxjs/operators';

import { createCollection } from '../custom-operators';
import { Updatable } from '../updatable';
import { getValue, when, whenProperty } from '../when';
import { notificationForProperty, observableForPropertyChain } from '../when';

import { TestClass } from './support';

describe('the getValue method', function() {
  it ('should fetch simple values', function() {
    const fixture = new TestClass();

    fixture.bar = 4;
    expect(getValue(fixture, f => f.bar).result).toEqual(4);

    fixture.bar = 10;
    expect(getValue(fixture, f => f.bar).result).toEqual(10);
  });

  it ('should fetch through Updatable values', function() {
    const fixture = new TestClass();
    expect(getValue(fixture, f => f.updatableFoo).result).toEqual(6);

    fixture.updatableFoo.next(10);
    expect(getValue(fixture, f => f.updatableFoo).result).toEqual(10);
  });

  it ('should fetch through Updatable values even when explicitly requested', function() {
    const fixture = new TestClass();
    expect(getValue(fixture, f => f.updatableFoo.value).result).toEqual(6);

    fixture.updatableFoo.next(10);
    expect(getValue(fixture, f => f.updatableFoo.value).result).toEqual(10);
  });

  it ('should fetch through Updatable when its the first one', function() {
    const fixture = new Updatable(() => of(new TestClass));

    expect(getValue(fixture, (f: any) => f.updatableFoo).result).toEqual(6);
  });

  it ('should fetch through Updatable when its the first one even when explicitly requested', function() {
    const fixture = new Updatable(() => of(new TestClass));

    expect(getValue(fixture, f => f.value.updatableFoo).result).toEqual(6);
  });

  it ('should fail if it cant walk the entire property chain', function() {
    const fixture = new TestClass();
    const { result, failed } = getValue(fixture, (f: any) => f.blart.boop.bop);

    expect(failed).toBeTruthy();
    expect(result).toEqual(undefined);
  });

  it ('should fail if walking the chain throws', function() {
    const fixture = new TestClass();
    const { result, failed } = getValue(fixture, f => f.explodingProperty.bar);

    expect(failed).toBeTruthy();
    expect(result).toEqual(undefined);
  });

  it ('should fail if walking the chain throws in an Updatable', function() {
    const fixture = new TestClass();
    fixture.updatableFoo.nextAsync(throwError(new Error('die')));

    const { result, failed } = getValue(fixture, f => f.updatableFoo);

    expect(failed).toBeTruthy();
    expect(result).toEqual(undefined);
  });
});

describe('the notificationForProperty method', function() {
  it('should notify me about props', function() {
    const fixture = { foo: new TestClass() };
    const inner = fixture.foo;

    const changes = createCollection(notificationForProperty(inner, 'bar'));
    expect(changes.length).toEqual(0);

    inner.bar = 5;
    expect(changes.length).toEqual(1);
    expect(changes[0]).toEqual({sender: inner, property: 'bar', value: 5});
    expect(Object.keys(changes[0]).length).toEqual(3);

    const changes2 = createCollection(notificationForProperty(fixture, 'foo'));
    expect(changes2.length).toEqual(0);

    changes2['foo'] = new TestClass();
    expect(changes2.length).toEqual(0);
  });

  it('should return nothing for non-models', function() {
    let changes = createCollection(notificationForProperty(5, '').pipe(materialize()));

    expect(changes.length).toEqual(0);

    const input = {foo: 'bar'};
    changes = createCollection(notificationForProperty(input, '').pipe(materialize()));

    expect(changes.length).toEqual(0);

    input.foo = 'barrr';
    expect(changes.length).toEqual(0);
  });
});

describe('the observableForPropertyChain method', function() {
  it('should return nothing for expressions it cant actually fetch', function() {
    const fixture = new TestClass();
    const result = createCollection(observableForPropertyChain(fixture, '__nothere'));
    expect(result.length).toEqual(0);

    fixture['__nothere'] = 0;
    expect(result.length).toEqual(0);
  });

  it('should subscribe to a one-item expression chain', function() {
    const fixture = new TestClass();
    const result = createCollection(observableForPropertyChain(fixture, 'foo'));
    expect(result.length).toEqual(1);

    fixture.foo = 5;
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual({ sender: fixture, property: 'foo', value: 5});

    fixture.foo = 5;
    expect(result.length).toEqual(2);

    fixture.foo = 7;
    expect(result.length).toEqual(3);

    expect(result[2]).toEqual({ sender: fixture, property: 'foo', value: 7});
    expect(Object.keys(result[0]).length).toEqual(3);
    expect(Object.keys(result[1]).length).toEqual(3);
    expect(Object.keys(result[2]).length).toEqual(3);
  });

  it('distinct should do what I expect it to', function() {
    const input = [
      { foo: 'bar', baz: 1 },
      { foo: 'bar', baz: 2 },
      { foo: 'bar', baz: 2 },
      { foo: 'bar', baz: 3 },
      { foo: 'bar', baz: 3 },
    ];

    const result = createCollection(of(...input)
      .pipe(distinctUntilChanged((a, b) => a.baz === b.baz)));

    expect(result.length).toEqual(3);
    expect(result[0].baz).toEqual(1);
    expect(result[1].baz).toEqual(2);
    expect(result[2].baz).toEqual(3);
  });

  it('switch should do what I expect', function() {
    const input: Subject<{subj: Observable<number>}> = new Subject();
    const result = createCollection(input.pipe(
      map((x) => x.subj),
      switchAll()));

    expect(result.length).toEqual(0);

    input.next({subj: concat(of(1, 2, 3), never())});
    expect(result.length).toEqual(3);
    input.next({subj: of(4, 5)});
    expect(result.length).toEqual(5);
  });

  it('should subscribe to a multi-item expression chain', function() {
    const fixture = new TestClass();
    fixture.bar = new TestClass();
    const barFixture = fixture.bar;

    const result = createCollection(observableForPropertyChain(fixture, 'bar.foo'));
    expect(result.length).toEqual(1);
    expect(result[0].sender).toEqual(fixture);
    expect(result[0].property).toEqual('bar.foo');
    expect(result[0].value).toEqual(undefined);


    fixture.bar.foo = 5;
    expect(result.length).toEqual(2);
    expect(result[1].sender).toEqual(fixture);
    expect(result[1].property).toEqual('bar.foo');
    expect(result[1].value).toEqual(5);

    barFixture.foo = 8;
    expect(result.length).toEqual(3);
    expect(result[2].sender).toEqual(fixture);
    expect(result[2].property).toEqual('bar.foo');
    expect(result[2].value).toEqual(8);

    fixture.bar = new TestClass();
    expect(result.length).toEqual(4);
    expect(result[3].sender).toEqual(fixture);
    expect(result[3].property).toEqual('bar.foo');
    expect(result[3].value).toEqual(fixture.bar.foo);

    fixture.bar = 5;
    expect(result.length).toEqual(4);

    barFixture.foo = 7;
    expect(result.length).toEqual(4);
  });
});

describe('the untyped whenProperty method', function() {
  it('should work in the single item case', function() {
    const fixture = new TestClass();
    const result = createCollection(whenProperty(fixture, 'foo'));
    expect(result.length).toEqual(1);

    fixture.foo = 5;
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual({ sender: fixture, property: 'foo', value: 5});

    fixture.foo = 5;
    expect(result.length).toEqual(2);

    fixture.foo = 7;
    expect(result.length).toEqual(3);

    expect(result[2]).toEqual({ sender: fixture, property: 'foo', value: 7});
    expect(Object.keys(result[0]).length).toEqual(3);
    expect(Object.keys(result[1]).length).toEqual(3);
    expect(Object.keys(result[2]).length).toEqual(3);
  });

  it('should combine values', function() {
    const fixture = new TestClass();

    const result = createCollection(whenProperty<TestClass, number, number, number>(fixture,
      'derived', 'subjectDerived',
      (x, y) => x.value! + y.value!));

    fixture.someSubject.next(10);

    expect(fixture.derived).toEqual(42);
    expect(fixture.subjectDerived).toEqual(10 * 10);

    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(10 * 10 + 42);

    fixture.someSubject.next(2);
    expect(result.length).toEqual(3);
    expect(result[2]).toEqual(2 * 10 + 42);
  });

  it('should reach through Updatables', function() {
    const fixture = new TestClass();
    const result = createCollection(whenProperty(fixture, 'updatableFoo'));

    expect(result.length).toEqual(1);
    expect(result[0].value).toEqual(6);

    fixture.updatableFoo.next(12);
    expect(result.length).toEqual(2);
    expect(result[1].value).toEqual(12);
  });
});

describe('the typed whenProperty method', function() {
  it('should work in the single item case', function() {
    const fixture = new TestClass();
    const result = createCollection(whenProperty(fixture, x => x.foo));
    expect(result.length).toEqual(1);

    fixture.foo = 5;
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual({ sender: fixture, property: 'foo', value: 5});

    fixture.foo = 5;
    expect(result.length).toEqual(2);

    fixture.foo = 7;
    expect(result.length).toEqual(3);

    expect(result[2]).toEqual({ sender: fixture, property: 'foo', value: 7});
    expect(Object.keys(result[0]).length).toEqual(3);
    expect(Object.keys(result[1]).length).toEqual(3);
    expect(Object.keys(result[2]).length).toEqual(3);
  });

  it('should combine values', function() {
    const fixture = new TestClass();

    const result = createCollection(whenProperty(fixture,
      x => x.derived, x => x.subjectDerived,
      (x, y) => x.value! + y.value!));

    fixture.someSubject.next(10);

    expect(fixture.derived).toEqual(42);
    expect(fixture.subjectDerived).toEqual(10 * 10);

    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(10 * 10 + 42);

    fixture.someSubject.next(2);
    expect(result.length).toEqual(3);
    expect(result[2]).toEqual(2 * 10 + 42);
  });

  it('should reach through Updatables', function() {
    const fixture = new TestClass();
    const result = createCollection(whenProperty(fixture, x => x.updatableFoo));

    expect(result.length).toEqual(1);
    expect(result[0].value).toEqual(6);

    fixture.updatableFoo.next(12);
    expect(result.length).toEqual(2);
    expect(result[1].value).toEqual(12);
  });
});


describe('the untyped when method', function() {
  it('should work in the single item case', function() {
    const fixture = new TestClass();
    const result = createCollection(when(fixture, 'foo'));
    expect(result.length).toEqual(1);

    fixture.foo = 5;
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(5);

    fixture.foo = 5;
    expect(result.length).toEqual(2);

    fixture.foo = 7;
    expect(result.length).toEqual(3);

    expect(result[2]).toEqual(7);
  });

  it('should combine values', function() {
    const fixture = new TestClass();

    const result = createCollection(when<TestClass, number, number, number>(fixture,
      'derived', 'subjectDerived',
      (x, y) => x + y));

    fixture.someSubject.next(10);

    expect(fixture.derived).toEqual(42);
    expect(fixture.subjectDerived).toEqual(10 * 10);

    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(10 * 10 + 42);

    fixture.someSubject.next(2);
    expect(result.length).toEqual(3);
    expect(result[2]).toEqual(2 * 10 + 42);
  });

  it('should reach through Updatables', function() {
    const fixture = new TestClass();
    const result = createCollection(when(fixture, 'updatableFoo.value'));

    expect(result.length).toEqual(1);
    expect(result[0]).toEqual(6);

    fixture.updatableFoo.next(12);
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(12);
  });
});

describe('the typed when method', function() {
  it('should work in the single item case', function() {
    const fixture = new TestClass();
    const result = createCollection(when(fixture, x => x.foo));
    expect(result.length).toEqual(1);

    fixture.foo = 5;
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(5);

    fixture.foo = 5;
    expect(result.length).toEqual(2);

    fixture.foo = 7;
    expect(result.length).toEqual(3);

    expect(result[2]).toEqual(7);
  });

  it('should combine values', function() {
    const fixture = new TestClass();

    const result = createCollection(when(fixture,
      x => x.derived, x => x.subjectDerived,
      (x, y) => x + y));

    fixture.someSubject.next(10);

    expect(fixture.derived).toEqual(42);
    expect(fixture.subjectDerived).toEqual(10 * 10);

    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(10 * 10 + 42);

    fixture.someSubject.next(2);
    expect(result.length).toEqual(3);
    expect(result[2]).toEqual(2 * 10 + 42);
  });

  it('should reach through Updatables', function() {
    const fixture = new TestClass();
    const result = createCollection(when(fixture, x => x.updatableFoo.value));

    expect(result.length).toEqual(1);
    expect(result[0]).toEqual(6);

    fixture.updatableFoo.next(12);
    expect(result.length).toEqual(2);
    expect(result[1]).toEqual(12);
  });

  it('should reach deeply through Updatables', function() {
    const fixture = new TestClass();
    const result = createCollection(when(fixture, x => x.updatableTodo.value!.title));

    expect(result.length).toEqual(0);
    fixture.updatableTodo.next({ title: 'foo', description: 'bar', completed: false });

    expect(result.length).toEqual(1);
    expect(result[0]).toEqual('foo');
  });
});
