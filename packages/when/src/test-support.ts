import { of, Subject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import { Model, toProperty, notifyFor, lazyFor } from './model';

interface TodoItem {
  title: string;
  description: string;
  completed: boolean;
}

export class TestClass extends Model {
  someSubject: Subject<number>;
  foo: number;
  bar: number | TestClass;
  baz: number;
  arrayFoo: number[];
  lazyFoo: number;
  lazyTodo: TodoItem | null;

  derived: number;
  subjectDerived: number;

  get explodingProperty(): TestClass {
    throw new Error('Kaplowie');
  }

  constructor() {
    super();
    this.arrayFoo = [1];
    this.someSubject = new Subject();

    notifyFor(this, x => x.foo, x => x.bar, x => x.arrayFoo);
    lazyFor(this, x => x.lazyFoo, () => of(25));

    toProperty(this, x => x.derived, of(42));

    toProperty(
      this,
      x => x.subjectDerived,
      this.someSubject.pipe(
        map((x) => x * 10),
        startWith(0),
      ),
    );
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('The test runner', function() {
  it('should pass this test', async function() {
    await delay(1000);
    expect(true).toBeTruthy();
  });
});
